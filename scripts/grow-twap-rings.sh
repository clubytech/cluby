#!/usr/bin/env bash
# Grow the Uniswap observation ring on every pool a TwapOracle reads, so the pool can physically
# reach back over the window the oracle asks for.
#
# Why it matters. `observe(1800)` reverts OLD the moment the far end of the window falls off the end
# of the ring, and that revert takes `price()` with it -- so borrow, withdrawCollateral and
# liquidate all stop, which is precisely the half that protects the lender. Uniswap's ring advances
# at most once per SECOND (Oracle.write deduplicates by timestamp, not by block), so the worst case
# is one slot per second of window: a 1,800-second window wants 1,800 slots.
#
# It is permissionless: any address can pay for it, and the pools keep the slots forever.
#
# It is also a TWO-step. increaseObservationCardinalityNext raises the target and writes the slots,
# but observationCardinality -- the number the oracle actually checks, because it is the one you can
# observe over -- does not move until a tick-moving swap wraps the index past the old end. On a
# quiet pool that takes a while. So: grow, wait, then list.
#
# -- The two things this script learned the expensive way ----------------------
#
# 1. THE GROWTH MUST BE CHUNKED. Each new slot costs about 22.4k gas, so 360 -> 1800 is roughly
#    32.3M gas in one call -- just over this node's ~32M per-transaction ceiling. A transaction
#    above it does not bounce: it is mined, burns the entire limit, and moves nothing. Three of them
#    cost 0.037 ETH and achieved nothing at all.
#
# 2. `cast send` EXITS 0 ON A FAILED TRANSACTION. A mined-and-reverted transaction is a perfectly
#    successful RPC call. The status is checked after every send now, and the first failure stops
#    the run rather than paying for the same mistake twice more.
#
# And one thing worth stating because it is not obvious: the steps are sized by ARITHMETIC, not by
# eth_estimateGas. Estimation runs against current state, so every step of a plan built up front is
# quoted as if it started from today's cardinality -- the numbers come out wrong and increasingly
# nonsensical. The cost per slot is a straight line (one cold SSTORE each), so arithmetic plans it
# correctly, and a fresh estimate immediately before each send is the check on that.
#
#   ./scripts/grow-twap-rings.sh              # print the plan, change nothing
#   ./scripts/grow-twap-rings.sh --send       # grow them
#   TARGET=900 ./scripts/grow-twap-rings.sh --send    # partial, if funding is short
#   ONLY=CASHCAT ./scripts/grow-twap-rings.sh --send  # one pool
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RPC="${CLUBY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"
TARGET="${TARGET:-1800}"
ONLY="${ONLY:-}"
# Well under the node's ~32M per-transaction ceiling: a step that estimates near the limit is a step
# that fails when the state shifts under it.
GAS_CEILING="${GAS_CEILING:-24000000}"
# Stop rather than leave the deployer unable to send anything at all.
RESERVE_ETH="${RESERVE_ETH:-0.004}"
PER_SLOT="${PER_SLOT:-22414}"
FIXED=40000

SEND=""
[ "${1:-}" = "--send" ] && SEND=1

# Every pool a TwapOracle reads or is meant to read. The first three price live markets; the rest
# are census listings that cannot be created until their ring reaches the window, because the oracle
# constructor refuses to build against a ring it cannot observe over.
POOLS="HIMS:0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64
PONS:0x7A192E71564ec66eE0763e328a3Ac274942dE4e1
CASHCAT:0x4B0c312fFbB068F6a0bEa128759E35d94B94D0E1
AMC:0xaA34feA710a1A737840329051D81D3B0B7C564d5
TTWO:0xD9Ab4b7fAe6DC2f7020134Ec744A8F53Ef3E5E24
DJT:0x31a89afd92F9397465649AD03226c52292fc1ae5
GLD:0x7A6A053eCCf1446A2633E05aA6D40D09381997ec
MRNA:0xA34d0667334074DF2d5BfD259e79E6B9cf1fA8Bf
RIVN:0xb30A75B200D98A600a3766869344928E35823E23
RBLX:0x2ef5945cd5664876b6481FdacFaA2942995a4DA8"

if [ -n "$SEND" ]; then
  . ./scripts/lib/signer.sh
else
  FROM="${FROM:-0x9C5C4b4A985b0A60a1067a0d82020774661d074A}"
fi
export TARGET GAS_CEILING PER_SLOT FIXED FROM

GP=$(python3 -c "print(int($(cast base-fee) * 2))")
RESERVE_WEI=$(python3 -c "print(int(float('$RESERVE_ETH') * 1e18))")

cardinality_of() {
  cast call "$1" "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" | sed -n '4p' | awk '{print $1}'
}
eth() { python3 -c "print(f'{$1/1e18:.4f}')"; }

plan_for() {
  python3 -c '
import os, sys
cur = int(sys.argv[1])
target = int(os.environ["TARGET"])
ceiling = int(os.environ["GAS_CEILING"])
per_slot, fixed = int(os.environ["PER_SLOT"]), int(os.environ["FIXED"])
per_step = max(1, (ceiling - fixed) // per_slot)
while cur < target:
    nxt = min(target, cur + per_step)
    print(nxt, per_slot * (nxt - cur) + fixed)
    cur = nxt
' "$1"
}

echo "signer  $FROM"
echo "gas     $(python3 -c "print(f'{$GP/1e9:.3f}')") gwei"
echo "target  $TARGET slots per pool"
echo "balance $(eth "$(cast balance "$FROM")") ETH"
echo

total_gas=0
ALL_STEPS=()
while IFS=: read -r name pool; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && continue
  cur=$(cardinality_of "$pool")
  if [ "$cur" -ge "$TARGET" ]; then
    printf "%-9s %4s -> already at or above %s\n" "$name" "$cur" "$TARGET"
    continue
  fi
  printf "%-9s %4s -> %s\n" "$name" "$cur" "$TARGET"
  while read -r to g; do
    [ -z "${to:-}" ] && continue
    printf "    step -> %-5s %12s gas  %s ETH\n" "$to" "$g" "$(eth "$((g * GP))")"
    total_gas=$((total_gas + g))
    ALL_STEPS+=("$name|$pool|$to|$g")
  done <<< "$(plan_for "$cur")"
done <<< "$POOLS"

echo
printf "total %s gas, %s ETH\n" "$total_gas" "$(eth "$((total_gas * GP))")"

if [ -z "$SEND" ]; then
  echo "(nothing sent -- pass --send to do it)"
  exit 0
fi
[ ${#ALL_STEPS[@]} -eq 0 ] && { echo "nothing to do."; exit 0; }

echo
for step in "${ALL_STEPS[@]}"; do
  IFS='|' read -r name pool to g <<< "$step"

  # A fresh estimate against the state as it is right now. The plan is arithmetic; this is the
  # check on it, and it costs nothing.
  real=$(cast estimate "$pool" "increaseObservationCardinalityNext(uint16)" "$to" --from "$FROM" 2>/dev/null | tail -1 || true)
  if [ -n "$real" ] && [ -z "${real//[0-9]/}" ]; then
    if [ "$real" -gt "$GAS_CEILING" ]; then
      echo "stopping: $name -> $to estimates $real gas, above the $GAS_CEILING ceiling." >&2
      echo "Lower GAS_CEILING and re-run; nothing was spent on this step." >&2
      exit 1
    fi
    g="$real"
  fi

  bal=$(cast balance "$FROM")
  need=$(python3 -c "print($g * 12 // 10 * $GP + $RESERVE_WEI)")
  if [ "$(python3 -c "print(1 if $bal < $need else 0)")" = "1" ]; then
    echo "stopping: $name -> $to needs $(eth "$need") ETH including the reserve, and $(eth "$bal") is left." >&2
    exit 1
  fi

  limit=$(python3 -c "print(min($g * 12 // 10, 30000000))")
  echo "$name -> $to (limit $limit)"
  out=$(cast send "$pool" "increaseObservationCardinalityNext(uint16)" "$to" \
    "${SIGNER[@]}" --gas-limit "$limit" --gas-price "$GP" 2>&1) || { echo "$out" | tail -3 >&2; exit 1; }

  status=$(echo "$out" | awk '/^status/ {print $2}')
  hash=$(echo "$out" | awk '/^transactionHash/ {print $2}')
  used=$(echo "$out" | awk '/^gasUsed/ {print $2}')
  if [ "$status" != "1" ]; then
    echo "  FAILED after $used gas. $hash" >&2
    echo "  Not sending the rest: the same failure would cost the same again." >&2
    exit 1
  fi
  echo "  ok, $used gas, $(eth "$((used * GP))") ETH   $hash"
done

echo
echo "result:"
while IFS=: read -r name pool; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && continue
  s=$(cast call "$pool" "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)")
  printf "  %-9s cardinality %s, next %s\n" "$name" \
    "$(echo "$s" | sed -n '4p' | awk '{print $1}')" "$(echo "$s" | sed -n '5p' | awk '{print $1}')"
done <<< "$POOLS"
printf "  deployer  %s ETH left\n" "$(eth "$(cast balance "$FROM")")"
echo
echo "The live cardinality only catches up as tick-moving swaps wrap the index. Re-run without"
echo "--send to watch it, and list a market once its pool has reached the window."
