#!/usr/bin/env bash
# Turn the operating USDG into gas and put it where it is needed.
#
# Three steps, in this order and for this reason:
#
#   1. USDG -> WETH through the 0.01% pool. It is the deepest of the four (6,296 WETH against
#      13.4M USDG) and the cheapest, and at these sizes the price impact is far below the fee.
#   2. WETH -> ETH. The swap cannot give native ETH, and gas cannot be paid in WETH.
#   3. Top the keeper up TO a target rather than BY an amount. Sending a fixed amount every run
#      either starves it or drains the deployer; a target sends the difference and nothing when
#      there is no difference.
#
# The keeper comes first on purpose. It is the only process here that has to be working at a moment
# nobody chooses, and a keeper out of gas fails in the quietest possible way — it watches a position
# go underwater and cannot act. The deployer only needs gas when a human is already watching.
#
#   ./scripts/fund-ops.sh                 # show the plan, change nothing
#   ./scripts/fund-ops.sh --send          # do it
#   RESERVE_USDG=20 ./scripts/fund-ops.sh --send      # keep 20 USDG back
#   KEEPER_TARGET_ETH=0.03 ./scripts/fund-ops.sh --send
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RPC="${CLUBY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"

USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
ROUTER=0xCaf681a66D020601342297493863E78C959E5cb2
POOL=0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca   # USDG/WETH, 0.01%
POOL_FEE=100
KEEPER="${KEEPER:-0x61b134A8d133802170093367c7241047158F33A0}"

KEEPER_TARGET_ETH="${KEEPER_TARGET_ETH:-0.02}"
DEPLOYER_FLOOR_ETH="${DEPLOYER_FLOOR_ETH:-0.01}"
RESERVE_USDG="${RESERVE_USDG:-0}"
SLIPPAGE_BPS="${SLIPPAGE_BPS:-50}"

SEND=""
[ "${1:-}" = "--send" ] && SEND=1

. ./scripts/lib/signer.sh
gas_price() { python3 -c "print(int($(cast base-fee) * 2))"; }
GP=$(gas_price)

usdg_of()  { cast call "$USDG" "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
weth_of()  { cast call "$WETH" "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
eth_of()   { cast balance "$1"; }

BAL_USDG=$(usdg_of "$FROM")
BAL_ETH=$(eth_of "$FROM")
KEEPER_ETH=$(eth_of "$KEEPER")
SQRT=$(cast call "$POOL" "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" | head -1 | awk '{print $1}')

read -r SWAP_IN MIN_OUT EXP_ETH TOPUP RING_ETH <<EOF
$(python3 - <<PY
sqrt = $SQRT
# token0 is WETH, token1 is USDG, so this is raw USDG per raw WETH.
rate = (sqrt / 2**96) ** 2

bal_usdg = $BAL_USDG
reserve = int(float("$RESERVE_USDG") * 1e6)
swap_in = max(0, bal_usdg - reserve)

expected_weth = int(swap_in / rate) if rate > 0 else 0
min_out = expected_weth * (10_000 - $SLIPPAGE_BPS) // 10_000

target = int(float("$KEEPER_TARGET_ETH") * 1e18)
topup = max(0, target - $KEEPER_ETH)

# What growing the three TWAP rings would cost at the current gas price: 22,414 gas a slot plus a
# fixed ~30k, over 1,440 + 1,500 + 1,440 slots.
ring = (22414 * (1440 + 1500 + 1440) + 3 * 30313) * $GP

print(swap_in, min_out, expected_weth, topup, ring)
PY
)
EOF

fmt6()  { python3 -c "print(f'{$1/1e6:.6f}')"; }
fmt18() { python3 -c "print(f'{$1/1e18:.6f}')"; }

echo "signer   $FROM"
echo "gas      $(python3 -c "print(f'{$GP/1e9:.3f}')") gwei"
echo
echo "now:"
printf "  deployer  %s ETH   %s USDG\n" "$(fmt18 "$BAL_ETH")" "$(fmt6 "$BAL_USDG")"
printf "  keeper    %s ETH\n" "$(fmt18 "$KEEPER_ETH")"
echo
echo "plan:"
printf "  swap      %s USDG -> at least %s ETH  (0.01%% pool, %s bps slippage)\n" \
  "$(fmt6 "$SWAP_IN")" "$(fmt18 "$MIN_OUT")" "$SLIPPAGE_BPS"
printf "  unwrap    all WETH to native ETH\n"
if [ "$TOPUP" = "0" ]; then
  printf "  keeper    already at or above %s ETH, sending nothing\n" "$KEEPER_TARGET_ETH"
else
  printf "  keeper    top up to %s ETH, sending %s\n" "$KEEPER_TARGET_ETH" "$(fmt18 "$TOPUP")"
fi
printf "  deployer  keeps the rest\n"
echo

LEFT=$(python3 -c "print($BAL_ETH + $EXP_ETH - $TOPUP)")
printf "after, roughly:\n"
printf "  deployer  %s ETH  (floor %s)\n" "$(fmt18 "$LEFT")" "$DEPLOYER_FLOOR_ETH"
printf "  keeper    %s ETH\n" "$(fmt18 "$(python3 -c "print($KEEPER_ETH + $TOPUP)")")"
echo
printf "the TWAP rings need %s ETH at this gas price: " "$(fmt18 "$RING_ETH")"
python3 -c "
short = $RING_ETH - ($LEFT - int(float('$DEPLOYER_FLOOR_ETH') * 1e18))
print('covered' if short <= 0 else f'short by {short/1e18:.4f} ETH after keeping the deployer floor')
"

if [ -z "$SEND" ]; then
  echo
  echo "(nothing sent — pass --send to do it)"
  exit 0
fi

[ "$SWAP_IN" = "0" ] && { echo; echo "no USDG to swap."; exit 0; }

echo
ALLOWANCE=$(cast call "$USDG" "allowance(address,address)(uint256)" "$FROM" "$ROUTER" | awk '{print $1}')
if [ "$(python3 -c "print(1 if $ALLOWANCE < $SWAP_IN else 0)")" = "1" ]; then
  echo "approving the router for $(fmt6 "$SWAP_IN") USDG"
  cast send "$USDG" "approve(address,uint256)" "$ROUTER" "$SWAP_IN" \
    "${SIGNER[@]}" --gas-limit 120000 --gas-price "$GP" | grep -E "^status"
fi

echo "swapping"
cast send "$ROUTER" \
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
  "($USDG,$WETH,$POOL_FEE,$FROM,$SWAP_IN,$MIN_OUT,0)" \
  "${SIGNER[@]}" --gas-limit 400000 --gas-price "$GP" | grep -E "^status"

GOT=$(weth_of "$FROM")
echo "  received $(fmt18 "$GOT") WETH"
[ "$GOT" = "0" ] && { echo "the swap returned nothing; stopping before the unwrap." >&2; exit 1; }

echo "unwrapping"
cast send "$WETH" "withdraw(uint256)" "$GOT" \
  "${SIGNER[@]}" --gas-limit 120000 --gas-price "$GP" | grep -E "^status"

# Recomputed against the real balance, not the estimate: the top-up has to reflect what actually
# arrived, and it must never spend the gas the next transaction needs.
NOW_ETH=$(eth_of "$FROM")
KEEPER_ETH=$(eth_of "$KEEPER")
TOPUP=$(python3 -c "
target = int(float('$KEEPER_TARGET_ETH') * 1e18)
want = max(0, target - $KEEPER_ETH)
spare = max(0, $NOW_ETH - int(float('$DEPLOYER_FLOOR_ETH') * 1e18))
print(min(want, spare))
")

if [ "$TOPUP" != "0" ]; then
  echo "sending $(fmt18 "$TOPUP") ETH to the keeper"
  cast send "$KEEPER" --value "$TOPUP" "${SIGNER[@]}" --gas-limit 30000 --gas-price "$GP" | grep -E "^status"
else
  echo "keeper needs nothing, or the deployer has nothing spare above its floor"
fi

echo
echo "done:"
printf "  deployer  %s ETH   %s USDG\n" "$(fmt18 "$(eth_of "$FROM")")" "$(fmt6 "$(usdg_of "$FROM")")"
printf "  keeper    %s ETH\n" "$(fmt18 "$(eth_of "$KEEPER")")"
