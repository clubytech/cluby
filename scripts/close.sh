#!/usr/bin/env bash
# Close the position: repay the whole debt, take the collateral back.
#
#   ./scripts/close.sh
#
# The vault deposit is left alone — that is a separate decision. Once the debt is gone the vault's
# full $50 becomes withdrawable again, since nothing is lent out.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RPC="${CANARY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"

MORPHO=0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC
ORACLE=0xB5736a58CE6370DaD1888d8996cf64A22e622BB8
IRM=0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1
ID=0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826
PARAMS="($USDG,$NVDA,$ORACLE,$IRM,625000000000000000)"

# The base fee here has moved between 0.4 and 10 gwei within an hour; take the current one.
gas_price() { python3 -c "print(int($(cast base-fee) * 2))"; }
. ./scripts/lib/signer.sh

read -r SUPPLY_SHARES BORROW_SHARES COLLATERAL <<<"$(cast call $MORPHO 'position(bytes32,address)(uint256,uint128,uint128)' $ID $FROM | awk '{print $1}' | tr '\n' ' ')"
read -r TA TSH TB TBSH REST <<<"$(cast call $MORPHO 'market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)' $ID | awk '{print $1}' | tr '\n' ' ')"

DEBT=$(python3 -c "
shares=$BORROW_SHARES; ta=$TB; tsh=$TBSH
# Morpho rounds a borrower's debt UP; matching that is what makes a shares-repay close it exactly.
print(0 if tsh==0 else -(-(shares*(ta+1))//(tsh+10**6)))")

echo "position: $(python3 -c "print(f'{$COLLATERAL/1e18:.6f}')") NVDA collateral, debt $(python3 -c "print(f'{$DEBT/1e6:,.2f}')") USDG"
if [ "$BORROW_SHARES" = "0" ] && [ "$COLLATERAL" = "0" ]; then echo "nothing to close"; exit 0; fi

if [ "$BORROW_SHARES" != "0" ]; then
  # Approve a little over the debt: it keeps growing while the wallet is open.
  ALLOW=$(python3 -c "print(int($DEBT * 1.02) + 1)")
  echo "==> approving Morpho for $(python3 -c "print(f'{$ALLOW/1e6:,.2f}')") USDG"
  cast send "$USDG" "approve(address,uint256)" "$MORPHO" "$ALLOW" \
    "${SIGNER[@]}" --gas-limit 200000 --gas-price "$(gas_price)" >/dev/null

  # Repay by SHARES, not assets: interest accrues between quoting and landing, and an
  # assets-denominated "repay everything" leaves dust that keeps the collateral locked.
  echo "==> repaying the whole debt"
  cast send "$MORPHO" "repay((address,address,address,address,uint256),uint256,uint256,address,bytes)(uint256,uint256)" \
    "$PARAMS" 0 "$BORROW_SHARES" "$FROM" 0x \
    "${SIGNER[@]}" --gas-limit 400000 --gas-price "$(gas_price)" | grep -E "^status" || true
fi

if [ "$COLLATERAL" != "0" ]; then
  echo "==> withdrawing $(python3 -c "print(f'{$COLLATERAL/1e18:.6f}')") NVDA"
  cast send "$MORPHO" "withdrawCollateral((address,address,address,address,uint256),uint256,address,address)" \
    "$PARAMS" "$COLLATERAL" "$FROM" "$FROM" \
    "${SIGNER[@]}" --gas-limit 400000 --gas-price "$(gas_price)" | grep -E "^status" || true
fi

echo
echo "==> after"
python3 - "$(cast call $USDG 'balanceOf(address)(uint256)' $FROM | awk '{print $1}')" \
          "$(cast call $NVDA 'balanceOf(address)(uint256)' $FROM | awk '{print $1}')" \
          "$(cast call 0x97e813828B0250dCa5c05FF2567dfD616E5b3C61 'maxWithdraw(address)(uint256)' $FROM | awk '{print $1}')" <<'PY'
import sys
u,n,mw=[int(x or 0) for x in sys.argv[1:4]]
print(f"  wallet {u/1e6:,.2f} USDG · {n/1e18:.6f} NVDA")
print(f"  vault withdrawable now {mw/1e6:,.2f} USDG")
PY
