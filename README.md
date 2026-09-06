<p align="center">
  <img src="assets/banner.jpeg" alt="Cluby — credit against tokenized stocks" width="100%">
</p>

<h1 align="center">Cluby</h1>

<p align="center">
  <b>A credit layer for tokenized stocks, on Robinhood Chain.</b><br>
  Post tokenized NVDA, SPY or AAPL as collateral and borrow USDG against it — without selling the position.
</p>

<p align="center">
  <a href="https://cluby.cash"><img alt="Live" src="https://img.shields.io/badge/live-cluby.cash-03926B?style=flat-square"></a>
  <img alt="Chain" src="https://img.shields.io/badge/chain-Robinhood%204663-0FAF83?style=flat-square">
  <img alt="Markets" src="https://img.shields.io/badge/markets-35%20live%20%2F%2043%20planned-40C09C?style=flat-square">
  <img alt="Tests" src="https://img.shields.io/badge/tests-101%20passing-03926B?style=flat-square">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square"></a>
</p>

---

## We did not write a lending protocol

Deposits, collateral, debt and liquidations live inside [Morpho Blue](https://github.com/morpho-org/morpho-blue) — immutable, audited, and impossible for us to upgrade or reach into.

What is in this repository is the **curation layer above it**: the markets, the oracles, the risk parameters, the routing, the keeper and the interface. None of it takes custody. The routers hold no balance between transactions, and the liquidator funds itself entirely from flash loans — which is why the protocol needs no treasury standing behind it.

> Your money sits in code that cannot change, and our code cannot touch it.

---

## The parts, and what each one is for

| Contract | What it does | Why it is interesting |
|---|---|---|
| [`TwapOracle`](contracts/src/oracles/TwapOracle.sol) | A 30-minute time-weighted price from a Uniswap v3 pool | **Refuses to deploy against a pool whose observation ring is too short for its own window.** Most TWAP oracles do not check, and a pool that cannot answer a 30-minute question will happily answer a wrong one |
| [`InverseOracle`](contracts/src/oracles/InverseOracle.sol) | The same price read from the other side | Lets a stock be the *borrowed* asset, so you can short it. Same feed, same trust, no second source to disagree |
| [`MinOracle`](contracts/src/oracles/MinOracle.sol) | The lower of two sources | Belt and braces where a single feed would be a single point of failure |
| [`Lens`](contracts/src/periphery/Lens.sol) | Every number the site, keeper and indexer read | Applies **pending interest** before answering. A health factor computed from stale debt is too generous — exactly the direction that makes a liquidator's simulation disagree with the transaction it then sends |
| [`FlashLiquidator`](contracts/src/periphery/FlashLiquidator.sol) | Liquidation with zero capital | Reads a **price floor from the oracle at the moment it acts** and refuses to sell collateral more than 8% below it. A liquidator with no floor dumps into a thin pool and hands the difference to whoever is on the other side |
| [`LeverageRouter`](contracts/src/periphery/LeverageRouter.sol) | Leveraged open/close in one transaction | Flash loan, swap, supply, borrow, repay — settled together, with the resulting health factor shown before signature |
| [`CreditRegistry`](contracts/src/incentives/CreditRegistry.sol) | Borrower scores | The score changes what a borrower is **paid**, never what they may **borrow**. That line is the whole design |
| [`MerkleDistributor`](contracts/src/incentives/MerkleDistributor.sol) | Weekly rebates in USDG | **Refuses to publish an epoch its own balance cannot cover.** A published root is money already in the contract, not a promise |
| [`TokenRegistry`](contracts/src/token/TokenRegistry.sol) | Where the token's address is announced | The ticker is read from the token's own `symbol()`, so the label and the contract cannot disagree — and an address with no code cannot be published at all |

---

## Things this repository knows that cost us something to learn

Every one of these is a comment in the code, not a blog post. They are here because each was found the expensive way.

**A tokenized stock can lie about its own balance.** Twelve of the 203 tokenized equities on this chain carry a display multiplier that is not one — one holds a single unit and shows you four. It is a presentation field. A protocol that reads it as a quantity misprices collateral by a factor of four and never notices until a liquidation fails to clear. See [`docs/chain-facts.md`](docs/chain-facts.md).

**A Uniswap pool only remembers about one minute by default.** A 30-minute TWAP against a pool with a 60-second observation ring is a number that looks like a price. Extending the ring is permissionless, is not free, and is nobody's job — so it does not get done. We bought the memory on every pool we price against before opening the markets, and the oracle refuses to deploy without it.

**A call into an address with no code reverts with *empty* data.** One deploy was handed an address sharing four leading bytes with Morpho's and nothing else. Every read failed with no reason string, which reads downstream as "this market is broken" rather than "this deploy is broken". The constructor now rejects a codeless address, and [`DeployLens.s.sol`](contracts/script/DeployLens.s.sol) calls a live market *through the contract it just deployed* before it will print an address worth pasting anywhere.

**`cast send` exits 0 on a transaction that mined and reverted.** A transaction over the node's per-transaction gas ceiling is not rejected — it is mined, burns the entire limit, and moves nothing. Scripts here read the status rather than the exit code.

**A metered endpoint that runs out does not fail quietly.** It refuses every call, promptly, and a backfill will spend its whole request budget being told no while looking perfectly healthy. The indexer believes the first refusal and stops asking.

---

## Repository layout

```
contracts/src/          the protocol — oracles, periphery, incentives
contracts/test/         101 unit tests + fork tests against live mainnet state
contracts/script/       deploys, each one verifying its own result before printing an address
packages/config/        every address, market and risk parameter, in one place
packages/sdk/           reads and transaction builders
apps/web/               the interface (Next.js)
apps/keeper/            the liquidation and oracle-divergence watchdog
apps/indexer/           Ponder indexer and the API the site reads
ops/systemd/            how the keeper and indexer are actually run
docs/                   chain research: what exists on this chain and what can be priced
```

---

## What the keeper can and cannot do

This is the part worth reading if you are deciding whether to trust the protocol.

The keeper watches every oracle against live pool trading, alerts a human, and calls the liquidator on positions that are already underwater by the market's own arithmetic.

**It is not an allocator on the vault. It cannot set a cap, cannot move liquidity, cannot open a position, cannot change a parameter, and cannot touch anyone's funds.** Every power it has reduces exposure. Withdrawing a cap is a decision the multisig makes, in public, behind a 24-hour timelock.

The tempting design is a keeper that pulls liquidity automatically at 3am and tells you in the morning. That is also a key on a server with the authority to drain a vault into a market of its choosing. We would rather be woken up.

---

## Risk, stated plainly

- **Liquidation thresholds are immutable.** An LLTV is part of a market's identity, not its storage — the market's address is derived from its parameters, so changing one does not edit a market, it names a different market that does not exist. There is no governance path to your liquidation threshold because there is no function that could be called.
- **Markets are isolated.** A bad debt in one cannot reach another.
- **The performance fee is zero today**, and raising it is submitted publicly and cannot execute for 24 hours.
- **Caps start deliberately low** and rise against measured exit liquidity, not enthusiasm. A cap larger than the pool behind it is a promise the exit cannot keep.

Read [`What breaks, and what happens then`](https://cluby.cash/docs) first. A protocol that will not write that section has not thought about it.

---

## Running it

```bash
pnpm install
cd contracts && forge test              # 101 unit tests
forge test --match-path 'test/fork/*'   # against live mainnet state, needs an RPC
pnpm --filter @cluby/web dev
```

Fork tests read real deployed contracts. Set `ROBINHOOD_RPC_URL` to an archive endpoint for the ones that read historical state.

---

## Security

Found something? See [SECURITY.md](SECURITY.md). Please do not open a public issue for a live vulnerability.

## License

MIT — see [LICENSE](LICENSE).
