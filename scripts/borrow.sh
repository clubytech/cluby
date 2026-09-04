#!/usr/bin/env bash
# Step 4 on its own: post collateral and borrow against it.
#
# A separate file rather than a long one-liner, because pasting a long command into a terminal is
# how "--private-key" becomes an em dash and forge is handed an address to sign with.
#
#   ./scripts/borrow.sh                 # 0.4 NVDA collateral, $35 borrowed
#   COLLATERAL=0.4 BORROW=25 ./scripts/borrow.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RPC="${CANARY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
MARKET_ID=0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826
LENS=0x5fC2Cd44d8caA4b3A6e330849bEbc3cA323c625b
NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC
MORPHO=0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010

COLLATERAL=${COLLATERAL:-0.4}
BORROW=${BORROW:-35}
COL_UNITS=$(python3 -c "print(int($COLLATERAL * 10**18))")
BOR_UNITS=$(python3 -c "print(int($BORROW * 10**6))")

# The base fee on this chain has moved between 0.4 and 10 gwei within an hour, so a hard-coded
# price is a transaction that either overpays or is rejected outright with "max fee per gas less
# than block base fee". Take the current one and double it.
gas_price() { python3 -c "print(int($(cast base-fee) * 2))"; }
export ETH_RPC_URL="$RPC"

# The key is read here and never crosses a shell prompt.
if [ -z "${PRIVATE_KEY:-}" ]; then echo "PRIVATE_KEY missing from .env"; exit 1; fi
FROM=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "signing as $FROM"

ALLOWANCE=$(cast call "$NVDA" "allowance(address,address)(uint256)" "$FROM" "$MORPHO" | awk '{print $1}')
if [ "$(python3 -c "print(1 if $ALLOWANCE < $COL_UNITS else 0)")" = "1" ]; then
  echo "approving Morpho for $COLLATERAL NVDA"
  cast send "$NVDA" "approve(address,uint256)" "$MORPHO" "$COL_UNITS" \
    --private-key "$PRIVATE_KEY" --gas-limit 200000 --gas-price "$(gas_price)" >/dev/null
else
  echo "Morpho already approved for $(python3 -c "print($ALLOWANCE/1e18)") NVDA"
fi

echo "posting $COLLATERAL NVDA and borrowing $BORROW USDG"
cd contracts
MARKET=NVDA MARKET_ID="$MARKET_ID" LENS="$LENS" COLLATERAL="$COL_UNITS" BORROW="$BOR_UNITS" \
FOUNDRY_PROFILE=deploy forge script script/SeedMarket.s.sol \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --broadcast --slow --with-gas-price "$(gas_price)" 2>&1 |
  grep -E "collateral posted|borrowed|health factor|liquidation price|collateral value|debt |Error|revert" || true
