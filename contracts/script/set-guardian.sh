#!/usr/bin/env bash
# Give the vault a guardian.
#
# Today `guardian()` is the zero address, which makes the 24-hour timelock decorative: with no
# guardian, `onlyGuardianRole` resolves to the owner alone, so the only address that can revoke a
# pending `submitCap` or `submitTimelock` inside the window is the same address that submitted it.
# A timelock nobody independent can act during is a delay, not a control.
#
# Setting one costs nothing, needs no change to the Safe's threshold, and is instant —
# `setIsAllocator`/`submitGuardian` from zero applies immediately; only later changes are timelocked.
#
# The address must be one you control and that has NEVER been in plaintext anywhere. Not the
# deployer. The whole point is that it is a different failure domain from the owner key.
#
#   ./set-guardian.sh 0xYourColdAddress
set -euo pipefail

GUARDIAN="${1:?usage: set-guardian.sh <address>}"
VAULT="${VAULT:-0x97e813828B0250dCa5c05FF2567dfD616E5b3C61}"
RPC="${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"

case "$GUARDIAN" in
  0x[0-9a-fA-F]*) [ ${#GUARDIAN} -eq 42 ] || { echo "not an address: $GUARDIAN" >&2; exit 1; } ;;
  *) echo "not an address: $GUARDIAN" >&2; exit 1 ;;
esac

owner=$(cast call "$VAULT" "owner()(address)" --rpc-url "$RPC")
current=$(cast call "$VAULT" "guardian()(address)" --rpc-url "$RPC")
echo "vault    $VAULT"
echo "owner    $owner"
echo "guardian $current -> $GUARDIAN"

if [ "$(echo "$GUARDIAN" | tr 'A-Z' 'a-z')" = "$(echo "$owner" | tr 'A-Z' 'a-z')" ]; then
  echo >&2
  echo "Refusing: the guardian would be the owner. That is the state you have now." >&2
  exit 1
fi

echo
echo "The owner is a Safe, so this call has to go through it. Two ways:"
echo
echo "  A. Safe UI -> New transaction -> Transaction builder"
echo "     to:    $VAULT"
echo "     method: submitGuardian(address)"
echo "     value:  $GUARDIAN"
echo
echo "  B. Raw calldata, if you would rather paste it:"
cast calldata "submitGuardian(address)" "$GUARDIAN"
echo
echo "From zero it takes effect immediately — there is nothing to accept afterwards."
echo "Verify with:"
echo "  cast call $VAULT 'guardian()(address)' --rpc-url $RPC"
