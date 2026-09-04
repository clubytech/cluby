# Indexer

Ponder over Morpho Blue, filtered to Cluby's own markets, plus the Core USDG vault.

```sh
PONDER_RPC_URL_4663=<archive endpoint> START_BLOCK=54451901 \
VAULT_ADDRESSES=0x97e813828B0250dCa5c05FF2567dfD616E5b3C61 \
pnpm --filter @cluby/indexer dev
```

Endpoints on `:42069` — `/board`, `/vaults`, `/positions/open`, `/portfolio/:address`,
`/market/:id/series`, `/liquidations`, `/oracle/divergence`, `/stats`, `/graphql`.

## The RPC split, which is the whole trick here

Neither endpoint can do the job alone, and the failure modes look nothing like each other.

**Ponder gets the public node.** It serves `eth_getLogs` over tens of thousands of blocks and does
not rate-limit, which is what following a chain with a 214 ms block time requires.

**State reads go to the archive endpoint**, by an explicit viem client in `src/snapshot.ts`. The
public node is pruned, so a historical `eth_call` fails there.

Listing both endpoints in Ponder's `rpc` array is *worse than either*: Ponder spreads requests
across the list, so a wide log sweep lands on the ten-block-capped plan every other time and takes
the process down with it. The routing has to be explicit.

## Multicall is not an optimisation here, it is the difference between working and not

Each snapshot needs six reads per market plus one per feed. Issued separately, a backfill is over a
thousand archive calls, the free tier throttles, and indexing progress sits at 0.0% indefinitely —
with no error to explain it. Batched through Multicall3 it is one call per pass, and the same
backfill reaches 98.6% in two minutes.
