#!/usr/bin/env bash
# The canary, end to end, with real money. Four transactions, signed by you:
#   1. approve the vault to take USDG
#   2. deposit into the vault  (it lends into the NVDA market)
#   3. approve Morpho to take NVDA
#   4. post collateral and borrow  (the script refuses to exceed the safe cap)
#
#   ./scripts/canary.sh              # $50 deposit, 0.4 NVDA collateral, $35 borrowed
#   DEPOSIT=30 BORROW=25 ./scripts/canary.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

VAULT=0x97e813828B0250dCa5c05FF2567dfD616E5b3C61
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC
MORPHO=0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010
LENS=0x5fC2Cd44d8caA4b3A6e330849bEbc3cA323c625b
MARKET_ID=0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826

DEPOSIT=${DEPOSIT:-50}          # USDG into the vault
COLLATERAL=${COLLATERAL:-0.4}   # NVDA posted
BORROW=${BORROW:-35}            # USDG drawn

DEP_UNITS=$(python3 -c "print(int($DEPOSIT * 10**6))")
COL_UNITS=$(python3 -c "print(int($COLLATERAL * 10**18))")
BOR_UNITS=$(python3 -c "print(int($BORROW * 10**6))")

export ETH_RPC_URL="$ROBINHOOD_RPC_URL"
say() { printf "\n\033[1m==> %s\033[0m\n" "$1"; }

say "Before"
python3 - "$(cast call $USDG 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" \
          "$(cast call $NVDA 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" <<'PY'
import sys
u,n=[int(x) for x in sys.argv[1:3]]
print(f"  wallet {u/1e6:,.2f} USDG · {n/1e18:.6f} NVDA")
PY

say "1/4  approve the vault for $DEPOSIT USDG"
cast send "$USDG" "approve(address,uint256)" "$VAULT" "$DEP_UNITS" --private-key "$PRIVATE_KEY" >/dev/null
say "2/4  deposit $DEPOSIT USDG"
cast send "$VAULT" "deposit(uint256,address)" "$DEP_UNITS" "$DEPLOYER" --private-key "$PRIVATE_KEY" >/dev/null
echo "  vault now holds $(cast call $VAULT 'totalAssets()(uint256)' | awk '{printf "%.2f", $1/1e6}') USDG"

say "3/4  approve Morpho for $COLLATERAL NVDA"
cast send "$NVDA" "approve(address,uint256)" "$MORPHO" "$COL_UNITS" --private-key "$PRIVATE_KEY" >/dev/null

say "4/4  post collateral and borrow $BORROW USDG"
MARKET=NVDA MARKET_ID="$MARKET_ID" LENS="$LENS" COLLATERAL="$COL_UNITS" BORROW="$BOR_UNITS" \
  FOUNDRY_PROFILE=deploy forge script script/SeedMarket.s.sol \
  --rpc-url "$ROBINHOOD_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast \
  --root contracts 2>&1 | grep -E "health factor|liquidation price|collateral value|debt|borrowed|Error" || true

say "After"
python3 - "$(cast call $USDG 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" \
          "$(cast call $VAULT 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" \
          "$(cast call $VAULT 'totalAssets()(uint256)' | awk '{print $1}')" <<'PY'
import sys
u,sh,ta=[int(x) for x in sys.argv[1:4]]
print(f"  wallet {u/1e6:,.2f} USDG")
print(f"  vault shares {sh/1e18:.6f}, vault holds {ta/1e6:,.2f} USDG")
PY
echo
echo "Then: http://localhost:3007/portfolio?address=$DEPLOYER"
