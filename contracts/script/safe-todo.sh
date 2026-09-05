#!/usr/bin/env bash
# Everything waiting on a Safe signature, with the calldata, checked against the chain first so it
# never asks for a transaction that is already done.
set -euo pipefail
cd "$(dirname "$0")/../.."

RPC="${CLUBY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"

SAFE=0x90a82053b9012b6ea2D95f88ee81da969d4D8A85
VAULT=0x97e813828B0250dCa5c05FF2567dfD616E5b3C61
LIQ=$(grep -oE 'flashLiquidator: "0x[0-9a-fA-F]{40}"' packages/config/src/index.ts | grep -oE '0x[0-9a-fA-F]{40}')

echo "Safe  $SAFE  (threshold $(cast call $SAFE 'getThreshold()(uint256)'))"
echo
n=0

pending=$(cast call "$LIQ" "pendingOwner()(address)")
owner=$(cast call "$LIQ" "owner()(address)")
if [ "$(echo "$pending" | tr 'A-Z' 'a-z')" = "$(echo "$SAFE" | tr 'A-Z' 'a-z')" ]; then
  n=$((n+1))
  cat <<TXT
$n. Take ownership of FlashLiquidator $LIQ
   It is Ownable2Step, so the transfer is offered and not yet taken: today $owner
   still owns it. Until the Safe accepts, liquidation profit would go to the deploy
   key rather than to the Safe.

     to:     $LIQ
     method: acceptOwnership()
     data:   $(cast calldata "acceptOwnership()")

TXT
else
  echo "- FlashLiquidator ownership: already $owner, nothing to do"
fi

guardian=$(cast call "$VAULT" "guardian()(address)")
if [ "$guardian" = "0x0000000000000000000000000000000000000000" ]; then
  n=$((n+1))
  cat <<TXT
$n. Give the vault a guardian: $VAULT
   guardian() is zero, so onlyGuardianRole resolves to the owner and the only address
   that can revoke a pending cap or timelock change inside the 24-hour window is the
   one that submitted it. The timelock is a delay, not a control, until this is set.

   It has to be an address you control that has never been in plaintext, and it must
   not be the Safe itself. Then:

     ./contracts/script/set-guardian.sh 0xYourColdAddress

TXT
else
  echo "- Vault guardian: already $guardian, nothing to do"
fi

if [ "$n" = "0" ]; then echo; echo "Nothing is waiting on the Safe."; fi
