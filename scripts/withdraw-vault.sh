#!/usr/bin/env bash
# Take everything back out of the Cluby Core USDG vault.
#
# The vault is an ERC-4626 and the shares are ordinary tokens: whoever holds them can redeem at any
# time, with no lock and no notice. What can limit a redemption is utilisation — the vault cannot
# hand back what borrowers are holding — and right now nothing is borrowed, so all of it comes out.
#
# `redeem` rather than `withdraw`: it takes a share count, so "all of it" is expressible exactly.
# Asking for an amount instead would leave dust behind the moment a second of interest accrued.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
. ./scripts/lib/signer.sh

RPC="${CLUBY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"
VAULT="${VAULT:-0x97e813828B0250dCa5c05FF2567dfD616E5b3C61}"
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168

gas_price() { python3 -c "print(int($(cast base-fee) * 2))"; }

SHARES=$(cast call "$VAULT" "balanceOf(address)(uint256)" "$FROM" | awk '{print $1}')
if [ "$SHARES" = "0" ]; then echo "$FROM holds no shares in $VAULT"; exit 0; fi

echo "holder  $FROM"
echo "shares  $SHARES"
printf "worth   %.6f USDG\n" "$(cast call "$VAULT" 'convertToAssets(uint256)(uint256)' "$SHARES" | awk '{print $1/1e6}')"
printf "liquid  %.6f USDG\n" "$(cast call "$VAULT" 'maxWithdraw(address)(uint256)' "$FROM" | awk '{print $1/1e6}')"
printf "USDG before %.6f\n" "$(cast call "$USDG" 'balanceOf(address)(uint256)' "$FROM" | awk '{print $1/1e6}')"

# Simulated first: a redemption that would revert should not cost gas to discover.
cast call "$VAULT" "redeem(uint256,address,address)(uint256)" "$SHARES" "$FROM" "$FROM" --from "$FROM" >/dev/null

echo
echo "redeeming..."
cast send "$VAULT" "redeem(uint256,address,address)" "$SHARES" "$FROM" "$FROM" \
  "${SIGNER[@]}" --gas-limit 400000 --gas-price "$(gas_price)" | grep -E "^(status|transactionHash)"

printf "\nUSDG after  %.6f\n" "$(cast call "$USDG" 'balanceOf(address)(uint256)' "$FROM" | awk '{print $1/1e6}')"
printf "shares left %s\n" "$(cast call "$VAULT" 'balanceOf(address)(uint256)' "$FROM" | awk '{print $1}')"
