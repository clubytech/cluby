#!/usr/bin/env bash
# Redeploy Lens, FlashLiquidator and LeverageRouter after the audit fixes, then print exactly what
# has to change in the config and what the Safe still has to sign.
#
# In a file rather than a one-liner, for the reason the other scripts here are: a long command
# pasted into a terminal is how a flag turns into an em dash.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
. ./scripts/lib/signer.sh

RPC="${CLUBY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
export ETH_RPC_URL="$RPC"
OWNER="${OWNER:-0x90a82053b9012b6ea2D95f88ee81da969d4D8A85}"
# The keeper key lives only in /opt/cluby/.env on the VPS and is generated there, so this is the
# address it derives to and nothing more. The previous one (0xc2478f68…) was lost when an
# rsync --delete of the working tree removed the launcher script that carried it; the key is in
# the env file now, which nothing execs and nothing syncs over.
KEEPER="${KEEPER:-0x61b134A8d133802170093367c7241047158F33A0}"

gas_price() { python3 -c "print(int($(cast base-fee) * 2))"; }

echo "deployer $FROM"
echo "balance  $(cast balance "$FROM" --ether) ETH"
echo "owner    $OWNER (Safe)"
echo "keeper   $KEEPER"
echo

cd contracts
OWNER="$OWNER" KEEPER="$KEEPER" FOUNDRY_PROFILE=deploy forge script script/Redeploy.s.sol \
  --rpc-url "$RPC" "${SIGNER[@]}" --broadcast --slow --with-gas-price "$(gas_price)" 2>&1 |
  grep -E "Lens |FlashLiquidator |LeverageRouter |keeper authorised|maxSlippageWad|ownership offered|Error|revert|Total Paid"
