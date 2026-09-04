# Cluby

A credit layer for tokenized stocks on Robinhood Chain (4663): post NVDA, SPY, AAPL or any of
seventeen collaterals, borrow USDG against it, or lend USDG and earn what borrowers pay.

Cluby is a **curation layer on Morpho Blue**, not a lending protocol. Deposits, collateral, interest
and liquidations are Morpho's — immutable and audited many times over. What is ours is the choice of
markets, the oracle behind each, the caps a vault lends under, and the machinery that keeps a bad
position from becoming bad debt.

## On chain

| | Address |
|---|---|
| Lens | `0x5fC2Cd44d8caA4b3A6e330849bEbc3cA323c625b` |
| FlashLiquidator | `0x91B3c5b8C76386A8293B1CE97fE8dceB10733F5B` |
| LeverageRouter | `0xBF6cdE3F772cB3939dFCc313AA4E83C3452bab6B` |
| CreditRegistry | `0x86e8f3Bf88087774a530d70FfaD19b5257054E53` |
| MetaMorphoV1_1Factory | `0xD371727A6F3c5033204b6E4D5548EF4Ad40C9E20` |
| PreLiquidationFactory | `0xe57CC1F0ED5E760D2EcAaa04a1E0d1c690daAa0e` |
| Cluby Core USDG (cUSDG) | `0x97e813828B0250dCa5c05FF2567dfD616E5b3C61` |

Seventeen markets: SGOV at 86% LLTV, ETH at 77%, nine stocks and two short markets at 62.5%,
four long-tail at 38.5%. Full list with ids in `packages/config`.

The two factories are Morpho's own code, deployed by us because Morpho has not deployed them on
this chain. They are vendored unmodified — being the audited code is the whole reason to use them.

## Layout

```
contracts/   Foundry. Oracles (TWAP, inverse, min), Lens, FlashLiquidator, LeverageRouter,
             incentives, deploy scripts. Vendored Morpho sources under lib/.
packages/
  config/    Chain facts, market catalog, deployment record. One source of truth; the deploy
             scripts read a JSON exported from it.
  sdk/       Morpho share maths, health factor, liquidation price, leverage plans, reads and
             calldata builders. Shared by the site, indexer, keeper and MCP server.
  abi/       ABIs generated from Foundry artifacts.
apps/
  web/       Next.js. Markets, Earn, Portfolio, Stats, Docs, Builders — reads the chain directly.
  indexer/   Ponder over Morpho Blue, filtered to our markets. Snapshots, positions, points, scores.
  keeper/    Liquidations, oracle watchdog, score publishing.
  mcp/       The same numbers over MCP, for agents.
```

## Running

```sh
pnpm install
pnpm --filter @cluby/web dev                    # site
pnpm --filter @cluby/indexer dev                # indexer on :42069
pnpm --filter @cluby/keeper start               # keeper (watch-only without KEEPER_PK)
cd contracts && forge test                      # 39 unit tests
```

Fork tests and the vendored sources need their own profiles, because each vendored dependency pins
its own compiler:

```sh
forge test --match-path 'test/fork/*' --fork-url robinhood          # 0.8.28 suites
FOUNDRY_PROFILE=vault forge test --match-path 'test/fork/Vault*'     # MetaMorpho, 0.8.26
FOUNDRY_PROFILE=preliq forge test --match-path 'test/fork/PreLiq*'   # pre-liquidation, 0.8.27
```

`.env` holds the RPC and deploy key and is git-ignored. `docs/chain-facts.md` is the file to read
before touching anything on this chain — it records what was measured rather than assumed.

## What is deliberately not here

No staking or rebate contracts are deployed: they pay out, and paying out before there is anything
to pay from is how protocols end up printing. They are written and tested, waiting on a token and on
fees to distribute.

The vault's timelock is **zero**, which means the owner can change a cap and move liquidity in one
block. That must be raised to 24h before anyone else's money is in it.
