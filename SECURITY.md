# Security

## Reporting a vulnerability

**Do not open a public issue for a live vulnerability.** Cluby curates markets that hold real
deposits, and a public report is a race between whoever reads it first.

Report privately through GitHub's [security advisory](../../security/advisories/new) form, or to
[@ClubyTech](https://x.com/ClubyTech) asking for a private channel.

Please include what you can reproduce. A `proof_<claim>` Foundry test that goes red is the fastest
possible way to be taken seriously, and this repository is set up to run one.

## What is and is not in scope

**In scope** — anything in `contracts/src/`, the keeper's liquidation and authorisation logic, the
deploy scripts, and any way to make the interface sign something other than what it displays.

**Not in scope** — Morpho Blue itself (it is not ours and it is immutable), the tokenized equities,
Chainlink feeds, or Uniswap. If the finding is in one of those, it belongs upstream.

## What we already know and accept

Stated here so a report does not spend effort on ground already covered:

- **Thin markets are thin.** Caps start low on purpose and several pools cannot absorb a large
  liquidation without slippage. The liquidator refuses to sell more than 8% below the oracle rather
  than close a position at any price, so the failure mode is a liquidation that does not execute
  rather than one that executes badly.
- **A TWAP is movable given enough capital and patience.** Thirty minutes is chosen so that moving
  it costs more than the loan it would unlock, not so that it is impossible.
- **Chainlink can go stale.** The keeper compares every oracle against live pool trading and alerts
  on divergence; it cannot act on that alert by itself, by design.
- **The vault has no guardian set yet.** Until it does, the 24-hour timelock is the only delay on an
  owner action.

## Trust assumptions, in one place

- The multisig owns the vault, the liquidator, the credit registry and the token registry. The
  deploy key owns nothing.
- The keeper can only *reduce* exposure. It cannot open a position, move liquidity, change a
  parameter, or touch user funds.
- Liquidation thresholds and oracles are fixed when a market is created and cannot be edited by
  anyone, including us.
