#!/usr/bin/env bash
# End-to-end: a real position on an anvil fork of Robinhood Chain goes underwater, and the keeper
# clears it. Everything except the oracle is the live chain at the forked block — the oracle is ours
# because the exercise is to move the price, and a Chainlink feed cannot be moved honestly.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

ANVIL_PORT=${ANVIL_PORT:-8545}
RPC="http://127.0.0.1:$ANVIL_PORT"
# anvil's own funded account. Never a real key.
PK=0xac0971d6a7ea5d0e1a0e3a0e5b0a7c1e0e6d5c4b3a29180f7e6d5c4b3a291807
ACCOUNT=$(cast wallet address --private-key $PK)

cleanup() { kill "${ANVIL_PID:-}" "${KEEPER_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> forking Robinhood Chain"
anvil --fork-url "$ROBINHOOD_RPC_URL" --port "$ANVIL_PORT" --silent &
ANVIL_PID=$!
until cast block-number --rpc-url "$RPC" >/dev/null 2>&1; do sleep 0.5; done

echo "==> funding the test account"
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC
# Morpho holds both tokens here, so impersonating it is the cheapest way to get some on a fork.
WHALE=0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010
cast rpc anvil_setBalance "$ACCOUNT" 0xDE0B6B3A7640000 --rpc-url "$RPC" >/dev/null
cast rpc anvil_impersonateAccount "$WHALE" --rpc-url "$RPC" >/dev/null
cast rpc anvil_setBalance "$WHALE" 0xDE0B6B3A7640000 --rpc-url "$RPC" >/dev/null
cast send "$USDG" "transfer(address,uint256)" "$ACCOUNT" 5000000000 --from "$WHALE" --unlocked --rpc-url "$RPC" >/dev/null
cast send "$NVDA" "transfer(address,uint256)" "$ACCOUNT" 4000000000000000000 --from "$WHALE" --unlocked --rpc-url "$RPC" >/dev/null
echo "    USDG $(cast call $USDG 'balanceOf(address)(uint256)' $ACCOUNT --rpc-url $RPC | awk '{print $1}')"
echo "    NVDA $(cast call $NVDA 'balanceOf(address)(uint256)' $ACCOUNT --rpc-url $RPC | awk '{print $1}')"

echo "==> creating a market and a position at the edge of it"
OUT=$(cd contracts && FOUNDRY_PROFILE=deploy forge script script/SetupForkMarket.s.sol \
  --rpc-url "$RPC" --private-key "$PK" --broadcast 2>&1)
echo "$OUT" | grep -E "MARKET_ID|ORACLE|LENS|LIQUIDATOR|health factor" || { echo "$OUT" | tail -30; exit 1; }

# console2.log(string, address) prints the pair on ONE line; take the value from that same line.
val() { echo "$OUT" | grep -oE "$1 0x[0-9a-fA-F]+" | tail -1 | awk '{print $2}'; }
MARKET_ID=$(val MARKET_ID)
ORACLE=$(val ORACLE)
LENS=$(val LENS)
LIQ=$(val LIQUIDATOR)
echo "    market $MARKET_ID"

echo "==> dropping the oracle price 20%: the position goes underwater"
NEW_PRICE=$(python3 -c "print(int(231460000000000000000000000 * 0.8))")
cast send "$ORACLE" "set(uint256)" "$NEW_PRICE" --private-key "$PK" --rpc-url "$RPC" >/dev/null

OWNER_BEFORE=$(cast call "$USDG" "balanceOf(address)(uint256)" "$ACCOUNT" --rpc-url "$RPC" | awk '{print $1}')
echo "==> starting the keeper"
rm -f apps/keeper/.keeper-state.json
(cd apps/keeper && RPC_URL="$RPC" KEEPER_PK="$PK" LENS_ADDR="$LENS" FLASH_LIQ_ADDR="$LIQ" \
  MARKETS_JSON="{\"NVDA-FORK\":{\"id\":\"$MARKET_ID\",\"oracle\":\"$ORACLE\"}}" \
  START_BLOCK=$(cast block-number --rpc-url "$RPC") LOG_CHUNK=9000 POLL_MS=1500 \
  node --experimental-strip-types src/index.ts > /tmp/keeper-e2e.log 2>&1) &
KEEPER_PID=$!

for _ in $(seq 1 45); do
  grep -q "Liquidated" /tmp/keeper-e2e.log && break
  sleep 1
done

echo "==> keeper log"
tail -12 /tmp/keeper-e2e.log

if grep -q "Liquidated" /tmp/keeper-e2e.log; then
  OWNER_AFTER=$(cast call "$USDG" "balanceOf(address)(uint256)" "$ACCOUNT" --rpc-url "$RPC" | awk '{print $1}')
  python3 -c "print(f'==> PASS: {($OWNER_AFTER-$OWNER_BEFORE)/1e6:.2f} USDG of liquidation profit reached the owner')"
else
  echo "==> FAIL: the keeper never liquidated"; exit 1
fi
