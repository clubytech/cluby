# Local e2e on an anvil fork

Foundry: `export PATH="$HOME/.foundry/bin:$PATH"`. Public RPC works but is slow and hangs on heavy swaps; prefer an Alchemy `robinhood-mainnet` URL.

1. Fork: `anvil --fork-url $RPC --port 8545 --chain-id 4663 --block-time 5 --compute-units-per-second 60 --timeout 90000 --retries 10`
2. Deploy (anvil key #0, keeper key #1):
   `cd contracts && KEEPER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac09...ff80`
   Addresses are deterministic on a fresh fork: Market 0xCBBe2A5c…, Oracle 0x9fD16eA9…, Lens 0x987e8557…, Router 0xb932C834…, Flash 0xE8F7d98b…
3. ABIs: `node packages/abi/gen.mjs` (after every `forge build`).
4. Indexer: `cd apps/indexer && PONDER_RPC_URL_4663=http://127.0.0.1:8545 MARKET_ADDR=… LENS_ADDR=… START_BLOCK=<deploy block> npx ponder dev`
   Check `curl localhost:42069/board`, `/positions/open`, GraphQL at `/graphql`.
5. Scenario: `MARKET=… ROUTER=… LENS=… ORACLE=… NVDA_ID=… TARGET=315 ./scripts/e2e-anvil.sh all`
   Steps: fund (impersonates NVDA/WETH pool and Morpho for tokens), supply, short, pump, weekend. If the pump hangs the fork, shock the oracle instead: deploy `test/mocks/OracleMocks.sol:MockFeed`, `set(31000000000, now)`, then `StockOracle.setConfig(NVDA, USDG, (feed,7200,432000,0x0,1800,true,0))`.
6. Keeper: `cd apps/keeper && RPC_URL=http://127.0.0.1:8545 KEEPER_PK=0x59c6…690d MARKET_ADDR=… LENS_ADDR=… FLASH_LIQ_ADDR=… PONDER_URL=http://127.0.0.1:42069 node --experimental-strip-types src/index.ts`
   Expected: `ALERT HF 0.96…` then `ALERT Liquidated … profit … USDG`.

Tests: `forge test --no-match-path 'test/fork/*'` (unit + invariants, seconds); `ROBINHOOD_RPC_URL=… forge test --match-path 'test/fork/*' -vv` (2–3 min on the public RPC).
