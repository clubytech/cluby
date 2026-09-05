#!/usr/bin/env bash
# Execute one call through the Safe.
#
#   ./scripts/safe-exec.sh <to> <calldata> [description]
#
# The Safe is 1-of-1 on the deploy key, so this uses a PRE-VALIDATED signature rather than signing
# the Safe transaction hash: a 65-byte word of (r = the owner's address, s = 0, v = 1) tells the
# Safe "the sender is an owner and is approving right now", and the Safe checks that msg.sender
# equals r. It is the only signature form that needs no eth_sign, no EIP-712 payload assembled by
# hand, and no key material anywhere but where `cast` already reads it.
#
# This exists because the repository had no way to make the Safe do anything, while the Safe owns
# the vault, the liquidator and the credit registry — so every one of those had a pending action
# and no path to take it.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
. ./scripts/lib/signer.sh

TO="${1:?usage: safe-exec.sh <to> <calldata> [description]}"
DATA="${2:?usage: safe-exec.sh <to> <calldata> [description]}"
WHAT="${3:-}"

RPC="${CLUBY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"
SAFE="${SAFE:-0x90a82053b9012b6ea2D95f88ee81da969d4D8A85}"

OWNERS=$(cast call "$SAFE" "getOwners()(address[])")
THRESHOLD=$(cast call "$SAFE" "getThreshold()(uint256)")
echo "safe      $SAFE"
echo "owners    $OWNERS"
echo "threshold $THRESHOLD"
echo "sender    $FROM"
echo "to        $TO"
echo "data      $DATA"
[ -n "$WHAT" ] && echo "action    $WHAT"

# Refuse rather than send a transaction that cannot possibly execute: a Safe needing more than one
# signature cannot be driven from here, and pretending otherwise burns gas to revert.
if [ "${THRESHOLD%% *}" != "1" ]; then
  echo "threshold is not 1 — this script cannot assemble multiple signatures. Use the Safe UI." >&2
  exit 1
fi
# `${var,,}` is bash 4; macOS ships 3.2, and this script has to run from the laptop that holds the
# key. `tr` costs a process and works everywhere.
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
case "$(lower "$OWNERS")" in *"$(lower "$FROM")"*) ;; *) echo "$FROM is not an owner of $SAFE" >&2; exit 1;; esac

# r = the owner, left-padded to 32 bytes; s = 0; v = 1.
SIG="0x000000000000000000000000${FROM#0x}$(printf '0%.0s' {1..64})01"

echo
# `--from` is not decoration here. A pre-validated signature is accepted because msg.sender IS the
# owner; simulate without it and the Safe answers GS025 ("hash not approved") to a transaction that
# would have executed perfectly.
echo "simulating…"
cast call --from "$FROM" "$SAFE" \
  "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)" \
  "$TO" 0 "$DATA" 0 0 0 0 0x0000000000000000000000000000000000000000 0x0000000000000000000000000000000000000000 "$SIG"

GP=$(python3 -c "print(int($(cast base-fee) * 2))")
echo "sending (gas price $GP wei)…"
OUT=$(cast send "$SAFE" \
  "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)" \
  "$TO" 0 "$DATA" 0 0 0 0 0x0000000000000000000000000000000000000000 0x0000000000000000000000000000000000000000 "$SIG" \
  "${SIGNER[@]}" --gas-price "$GP" --json)

# `cast send` exits 0 on a transaction that mined and REVERTED. This repository has paid for that
# lesson more than once, so the status is read rather than assumed.
STATUS=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
HASH=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['transactionHash'])")
GAS=$(echo "$OUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(int(d['gasUsed'],16)*int(d['effectiveGasPrice'],16)/1e18)")
echo "tx     $HASH"
echo "status $STATUS"
printf "cost   %.8f ETH\n" "$GAS"
[ "$STATUS" = "0x1" ] || { echo "REVERTED — the Safe mined the transaction and it failed." >&2; exit 1; }

# A Safe swallows the inner call's failure into ExecutionFailure rather than reverting, so a 0x1
# status is not yet proof the thing we wanted actually happened.
if cast receipt "$HASH" --json | grep -qi "$(cast keccak 'ExecutionFailure(bytes32,uint256)' | sed 's/^0x//')"; then
  echo "the Safe executed, but the INNER call failed (ExecutionFailure)." >&2
  exit 1
fi
echo "ok"
