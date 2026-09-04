#!/usr/bin/env bash
# M0 discovery: does a Chainlink stock feed keep ticking over the weekend?
# Prints AnswerUpdated events (timestamp, answer) for one feed across a block range.
# Usage: ROBINHOOD_RPC_URL=... ./feed-weekend.sh <feedProxy> <fromBlock> <toBlock>
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
RPC="${ROBINHOOD_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
FEED="$1"; FROM="$2"; TO="$3"
AGG=$(cast call "$FEED" "aggregator()(address)" --rpc-url "$RPC")
echo "proxy $FEED -> aggregator $AGG"
# AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
SIG="AnswerUpdated(int256,uint256,uint256)"
cast logs --rpc-url "$RPC" --from-block "$FROM" --to-block "$TO" --address "$AGG" "$SIG" --json \
  | python3 -c '
import json,sys,datetime
for l in json.load(sys.stdin):
    cur=int(l["topics"][1],16); cur = cur-2**256 if cur>=2**255 else cur
    ts=int(l["data"][:66],16)
    print(datetime.datetime.utcfromtimestamp(ts).strftime("%a %Y-%m-%d %H:%M:%S"), "answer", cur/1e8, "block", int(l["blockNumber"],16))
'
