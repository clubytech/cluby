#!/usr/bin/env bash
# Grow the Uniswap observation ring on every pool a TwapOracle reads, so the pool can physically
# reach back over the window the oracle asks for.
#
# Why it matters. `observe(1800)` reverts `OLD` the moment the far end of the window falls off the
# end of the ring, and that revert takes `price()` with it — so `borrow`, `withdrawCollateral` and
# `liquidate` all stop, which is precisely the half that protects the lender. Uniswap's ring
# advances at most once per SECOND (`Oracle.write` deduplicates by timestamp, not by block), so the
# worst case is one slot per second of window: a 1,800-second window wants 1,800 slots.
#
# The three pools below sit at 300-360 against a 1,800-second window. They are not broken today —
# they hold 1.5 to 12 hours of real history, because nobody is moving their tick every second — but
# somebody willing to spend the money can make them revert, and on CASHCAT that money is about $65
# an hour. The contract now refuses to be constructed against a ring this small, so no NEW market
# can be listed in this state; these three were created before that check existed.
#
# It is permissionless: any address can pay for it, and the pools keep the slots forever.
#
#   ./scripts/grow-twap-rings.sh              # print the bill and stop
#   ./scripts/grow-twap-rings.sh --send       # actually grow them
#   TARGET=900 ./scripts/grow-twap-rings.sh --send   # partial, if funding is short
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RPC="${CLUBY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"
TARGET="${TARGET:-1800}"
SEND=""
[ "${1:-}" = "--send" ] && SEND=1

POOLS="HIMS:0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64
PONS:0x7A192E71564ec66eE0763e328a3Ac274942dE4e1
CASHCAT:0x4B0c312fFbB068F6a0bEa128759E35d94B94D0E1"

# ~22,414 gas a slot, measured on PONS against this chain, plus a fixed ~30k.
PER_SLOT=22414
FIXED=30313
BASE=$(cast base-fee)
PRICE=$((BASE * 2))

if [ -n "$SEND" ]; then
  . ./scripts/lib/signer.sh
  BAL=$(cast balance "$FROM")
  echo "signing as $FROM with $(cast to-unit "$BAL" ether) ETH"
else
  BAL=0
fi

total=0
echo
printf "%-9s %8s %8s %14s %12s\n" pool now target gas ETH
while IFS=: read -r name pool; do
  cur=$(cast call "$pool" "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" | sed -n '4p' | awk '{print $1}')
  if [ "$cur" -ge "$TARGET" ]; then
    printf "%-9s %8s %8s %14s %12s\n" "$name" "$cur" "$TARGET" "-" "already there"
    continue
  fi
  slots=$((TARGET - cur))
  gas=$((PER_SLOT * slots + FIXED))
  eth=$(python3 -c "print(f'{$gas * $PRICE / 1e18:.4f}')")
  total=$(python3 -c "print($total + $gas * $PRICE / 1e18)")
  printf "%-9s %8s %8s %14s %12s\n" "$name" "$cur" "$TARGET" "$gas" "$eth"

  if [ -n "$SEND" ]; then
    # 20% over the estimate: a gas limit is a ceiling, not a charge, and running out here wastes
    # the whole fee for nothing.
    limit=$((gas * 12 / 10))
    if [ "$(python3 -c "print(1 if $BAL < $limit * $PRICE else 0)")" = "1" ]; then
      echo "  not enough gas for $name — need $(python3 -c "print(f'{$limit * $PRICE / 1e18:.4f}')") ETH. Stopping here." >&2
      exit 1
    fi
    echo "  growing $name..."
    cast send "$pool" "increaseObservationCardinalityNext(uint16)" "$TARGET" \
      "${SIGNER[@]}" --gas-limit "$limit" --gas-price "$PRICE" | grep -E "^(status|transactionHash|gasUsed)"
    BAL=$(cast balance "$FROM")
  fi
done <<< "$POOLS"

echo
printf "total %.4f ETH at %s gwei\n" "$total" "$(python3 -c "print($PRICE/1e9)")"
[ -z "$SEND" ] && echo "(nothing sent — pass --send to do it)"
