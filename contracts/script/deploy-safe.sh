#!/usr/bin/env bash
# Deploy a 2-of-3 Safe on Robinhood Chain (4663) straight through the canonical 1.4.1 factory.
#
# app.safe.global does not carry chain 4663, but every Safe 1.4.1 contract is deployed here
# (verified by eth_getCode). So the Safe is created by a direct createProxyWithNonce call and
# afterwards signed with safe-cli (`safe-cli <safe> $ROBINHOOD_RPC_URL`), not the hosted UI.
#
#   OWNERS=0xA,0xB,0xC ./contracts/script/deploy-safe.sh          # dry run, prints the address
#   OWNERS=0xA,0xB,0xC BROADCAST=1 ./contracts/script/deploy-safe.sh
#
# The deployer key only pays gas: it is NOT an owner of the resulting Safe.
set -euo pipefail

cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a

SINGLETON=0x29fcB43b46531BcA003ddC8FCB67FFE91900C762   # SafeL2 1.4.1 (L2 variant: emits events)
FACTORY=0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67     # SafeProxyFactory 1.4.1
HANDLER=0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99     # CompatibilityFallbackHandler 1.4.1
THRESHOLD=${THRESHOLD:-2}
SALT=${SALT:-0}

: "${OWNERS:?set OWNERS=0xA,0xB,0xC — three distinct addresses on three distinct devices}"

IFS=',' read -r -a OWNER_ARR <<< "$OWNERS"
[ "${#OWNER_ARR[@]}" -ge "$THRESHOLD" ] || { echo "threshold $THRESHOLD > ${#OWNER_ARR[@]} owners"; exit 1; }
for o in "${OWNER_ARR[@]}"; do
  [ "$(cast to-check-sum-address "$o")" = "$(cast to-check-sum-address "$DEPLOYER")" ] && {
    echo "refusing: the hot deployer $DEPLOYER is in the owner set"; exit 1; }
done
printf 'owners (%d), threshold %d:\n' "${#OWNER_ARR[@]}" "$THRESHOLD"
printf '  %s\n' "${OWNER_ARR[@]}"

# setup(owners, threshold, to, data, fallbackHandler, paymentToken, payment, paymentReceiver)
INIT=$(cast calldata \
  'setup(address[],uint256,address,bytes,address,address,uint256,address)' \
  "[$OWNERS]" "$THRESHOLD" 0x0000000000000000000000000000000000000000 0x \
  "$HANDLER" 0x0000000000000000000000000000000000000000 0 0x0000000000000000000000000000000000000000)

PREDICTED=$(cast call "$FACTORY" \
  'createProxyWithNonce(address,bytes,uint256)(address)' "$SINGLETON" "$INIT" "$SALT" \
  --from "$DEPLOYER" --rpc-url "$ROBINHOOD_RPC_URL")
echo "safe address -> $PREDICTED"

if [ "${BROADCAST:-0}" != "1" ]; then echo "(dry run; re-run with BROADCAST=1)"; exit 0; fi

cast send "$FACTORY" 'createProxyWithNonce(address,bytes,uint256)(address)' \
  "$SINGLETON" "$INIT" "$SALT" \
  --private-key "$PRIVATE_KEY" --rpc-url "$ROBINHOOD_RPC_URL"

echo "--- verifying deployed Safe ---"
cast call "$PREDICTED" 'getThreshold()(uint256)' --rpc-url "$ROBINHOOD_RPC_URL"
cast call "$PREDICTED" 'getOwners()(address[])' --rpc-url "$ROBINHOOD_RPC_URL"
echo "put OWNER=$PREDICTED in .env before running DeployCore.s.sol"
