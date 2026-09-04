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

# This node intermittently refuses to estimate — it has already been caught returning a zero
# balance and an empty price under load, and it rejects a transaction that costs 0.00002 ETH from
# an account holding 0.0147 as "insufficient funds". So the gas is stated outright rather than
# asked for, and a refusal is retried instead of ending the run.
send() {
  local label="$1"; shift
  for attempt in 1 2 3; do
    # The limit is a ceiling, not a charge: unused gas is never billed, so it is set generously.
    # A deposit that allocates into a market costs ~354k, and the 300k this script first used ran
    # out of gas — which looks exactly like a revert unless you read the receipt.
    if out=$(cast send "$@" --private-key "$PRIVATE_KEY" --gas-limit 1500000 --gas-price 2gwei 2>&1); then
      if echo "$out" | grep -q "status *1"; then
        return 0
      fi
      echo "  $label: mined but reverted"
      echo "$out" | grep -E "^status|transactionHash" | head -2
      return 1
    fi
    echo "  $label: attempt $attempt failed — $(echo "$out" | grep -oE 'error code [-0-9]+: .*' | head -1)"
    sleep 3
  done
  echo "  $label: giving up"
  echo "$out" | tail -3
  return 1
}

say "Before"
python3 - "$(cast call $USDG 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" \
          "$(cast call $NVDA 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" <<'PY'
import sys
u,n=[int(x or 0) for x in sys.argv[1:3]]
print(f"  wallet {u/1e6:,.2f} USDG · {n/1e18:.6f} NVDA")
PY

say "1/4  approve the vault for $DEPOSIT USDG"
send "approve vault" "$USDG" "approve(address,uint256)" "$VAULT" "$DEP_UNITS"
say "2/4  deposit $DEPOSIT USDG"
send "deposit" "$VAULT" "deposit(uint256,address)" "$DEP_UNITS" "$DEPLOYER"
echo "  vault now holds $(cast call $VAULT 'totalAssets()(uint256)' | awk '{printf "%.2f", $1/1e6}') USDG"

say "3/4  approve Morpho for $COLLATERAL NVDA"
send "approve Morpho" "$NVDA" "approve(address,uint256)" "$MORPHO" "$COL_UNITS"

say "4/4  post collateral and borrow $BORROW USDG"
(cd contracts && MARKET=NVDA MARKET_ID="$MARKET_ID" LENS="$LENS" COLLATERAL="$COL_UNITS" BORROW="$BOR_UNITS" \
  FOUNDRY_PROFILE=deploy forge script script/SeedMarket.s.sol \
  --rpc-url "$ROBINHOOD_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --slow \
  --with-gas-price 2gwei) 2>&1 | grep -E "health factor|liquidation price|collateral value|debt|borrowed|Error" || true

say "After"
python3 - "$(cast call $USDG 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" \
          "$(cast call $VAULT 'balanceOf(address)(uint256)' $DEPLOYER | awk '{print $1}')" \
          "$(cast call $VAULT 'totalAssets()(uint256)' | awk '{print $1}')" <<'PY'
import sys
# This node returns an empty answer now and then; an empty read is zero here, not a crash.
u,sh,ta=[int(x or 0) for x in sys.argv[1:4]]
print(f"  wallet {u/1e6:,.2f} USDG")
print(f"  vault shares {sh/1e18:.6f}, vault holds {ta/1e6:,.2f} USDG")
PY
echo
echo "Then: http://localhost:3007/portfolio?address=$DEPLOYER"
