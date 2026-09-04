# Keeper

Two jobs, in order of how much they matter.

**Liquidations.** Every couple of seconds it reads the health factor of every borrower on our
markets through `Lens`, and for anything below 1 it sizes a flash-loan liquidation, simulates it,
and sends it only if the simulation passes and the profit clears `MIN_PROFIT`. Morpho's liquidation
is open to anyone — this exists so that it happens promptly at a sane price, not so that it happens
exclusively here. If the keeper is down, the market still clears; it just clears slower and at
whoever else's price.

**Oracle watchdog.** Every fifteen minutes it compares each market's oracle against the DEX pool for
the same asset and alerts when they disagree by more than `DIVERGENCE_BPS`. It does not touch caps
by itself: lowering a cap has consequences for depositors, and an automatic response to a divergence
it may have measured wrongly can do more damage than the divergence. It tells a human exactly what
it saw and what to do.

## Running

```sh
RPC_URL=... KEEPER_PK=0x... TELEGRAM_TOKEN=... TELEGRAM_CHAT=... pnpm --filter @cluby/keeper start
```

Without `KEEPER_PK` it runs watch-only: it reports what it would have done and signs nothing. That
is the mode to run first.

| Env | Default | Notes |
|---|---|---|
| `RPC_URL` | — | required; archive endpoint |
| `KEEPER_PK` | none | omit for watch-only |
| `LENS_ADDR`, `FLASH_LIQ_ADDR` | from `@cluby/config` | override for a fork |
| `MARKETS_JSON` | from `@cluby/config` | `{"KEY":{"id":"0x…","oracle":"0x…"}}` |
| `PONDER_URL` | none | when set, borrowers come from the indexer |
| `POLL_MS` | 2000 | health check interval |
| `WATCHDOG_MS` | 900000 | oracle-versus-pool interval |
| `DIVERGENCE_BPS` | 500 | alert threshold |
| `MIN_PROFIT` | 1000000 | $1 in USDG units |
| `LOG_CHUNK` | 10 | blocks per `eth_getLogs` |
| `CATCHUP_MS` | 1500 | time budget per pass for the backlog scan |

## Two things that shaped the design

**Alchemy's free tier caps `eth_getLogs` at a ten-block range.** With ~214 ms blocks that is two
seconds of history per request, so a scan from the deploy block is thousands of calls. Discovery is
therefore chunked, bounded per pass, run alongside the health checks rather than before them, and
persisted to `.keeper-state.json` so a restart does not start over. Raise `LOG_CHUNK` on a paid plan
and the whole problem goes away.

**RPC errors quote the request URL, and the URL carries the API key.** Everything printed or sent to
Telegram goes through `redact()` first. That matters more than it sounds: alerts are the output most
likely to be forwarded somewhere public.

## Verifying it

`scripts/e2e-keeper-anvil.sh` forks the live chain, opens a position at the edge of its liquidation
line against an oracle the test controls, drops the price, and waits for the keeper to clear it.
Everything except that oracle is the real chain — Morpho, the pool the collateral is sold into, the
token contracts — because the parts worth testing are the ones we did not write.
