# What was done about it

Companion to `2026-09-05-critic-panel.md`. Same numbering. Written after the work,
against the chain and the running services rather than against the diff.

## The list

| # | What | State | Where |
|---|---|---|---|
| 1 | Lens panics on one raw unit of collateral, taking the keeper's whole scan with it | **fixed, live** | `Lens.sol` denominator guard + per-market `try/catch` in `scanHealth` |
| 2 | Keeper returns early whenever the indexer answers 200 | **fixed** | chain scan is unconditional, indexer is a source to union in |
| 3 | Swap floor sits below the repayment above LLTV 70.297% | **fixed** | floor derived from the repayment; checked across 38.5%–86% |
| 4 | No alert on any failure; revert reason discarded | **fixed, proven live** | alerts on skip, revert, send failure, on-chain revert; reason decoded from the cause chain |
| 5 | Vault has no guardian; Safe owner is the key the project called hot | **script ready, needs an address** | `contracts/script/set-guardian.sh` |
| 6 | FlashLiquidator reads no oracle — no price floor of its own | **fixed, live** | `maxSlippageWad`, owner-set, capped at 20% |
| 7 | Unauthenticated HTTP rows become signed transactions | **fixed** | shape-checked in `borrowers.ts` and `scores.ts` |
| 8 | TwapOracle never checks the pool can reach back over its window | **fixed for new listings; three rings unfunded** | constructor `RingTooSmall`; `scripts/grow-twap-rings.sh` |
| 9 | `close()` has no deterministic way to close a position | **fixed, live** | `repayShares` + separate `flashAmount` |
| 10 | Portfolio and MCP compute debt on unaccrued state | **fixed** | `accrued()` in the SDK, `debtOf` rounds up |
| 11 | `NoProfit` measures the loan, not the repayment | **fixed, live** | one line, plus the same shape in `SwapShortfall` |
| 12 | Nobody watches the gas on either signing key | **fixed, proven live** | `checkGas` in the watchdog; it alerted at 0.004 against a 0.005 floor |
| 13 | Two economic guards covered by no test | **fixed** | 9 new `LeverageRouter` tests; 5 of 5 mutations killed |
| 14 | Fourteen small things | **fixed** | lastUpdate, previewBorrow safe cap, mulDiv, MIN_PROFIT scale, pool fee tier, alert decimals, argv keys, dead comments |

## The unverified findings, now verified

**(a)1 — systemd buries the keeper permanently.** True. `RestartSec=10,
StartLimitBurst=5, StartLimitIntervalSec=300`: fifty seconds of crashing and the
unit sits in `failed` until a human runs `reset-failed`, with no `OnFailure=`.
Widened to twenty restarts an hour with a climbing backoff, and `cluby-alert@`
now fires with the last journal lines and the command to recover.

It proved itself the same afternoon. An `rsync --delete` of the working tree
removed the launcher the unit execs — a real 203/EXEC, not a staged one — and the
alert fired.

**(a)2 — the gas balances.** Confirmed: 0.00998 and 0.01115 ETH, both matched.

**(a)3 — finding 2 had no second opinion.** Read and confirmed: three lines,
`borrowers.ts:67`, exactly as described.

**(a)5 — is the mempool public?** Still unknown, and now largely moot: with the
contract enforcing its own oracle floor, a sandwich of an honest keeper is
bounded by `maxSlippageWad` whether or not the mempool is visible.

**(a)6 — MinOracle is deployed nowhere.** Still true. Twelve Chainlink markets
have no TWAP leg, so the weekend-gap protection `MinOracle` was written for is
not switched on anywhere. Not addressed here; it needs a market-by-market
decision about which second leg to trust, not a code change.

## Two things the fork suite caught that reading did not

**A mistake of my own.** Stamping `lastUpdate` inside `_accrued` was right for
the struct, but `marketView` then asked the IRM about that struct — and the IRM's
`rateAtTarget` is stale on exactly the same schedule, since both only move when
Morpho accrues. Asking with elapsed at zero returns the rate from the last
interaction with the adaptation across the window skipped: 303332813 against the
199995138 Morpho would charge, half again too high on a market untouched for a
week. The rate is read from the raw market now. Caught by
`ProofLensState.fork.t.sol` against real Morpho with a real borrower and a
seven-day warp, and it cost a fourth Lens deploy.

**A finding that refuted itself.** "close() needs idle liquidity it cannot
guarantee" turns out to be mostly false. Morpho Blue holds every market's assets
in one contract balance and `flashLoan` lends from that balance, not from the
market's own idle supply — so a fully drawn market, every supplied dollar
borrowed, still closes. Measured on a fork:
`test_closeSurvivesAFullyDrawnMarket`. Only a Morpho holding no USDG anywhere
would block it, and the fallback is a direct repay that needs no liquidity at all.

## Deployed

    Lens             0x6159fbBe4d521fd673A496948910791d7eec7B58
    FlashLiquidator  0xC3374D9fB0CC9a85440f26EE461aF6Bfb6c6e7cE
    LeverageRouter   0x12aD902c5004d5147D7F46dC97818cA26Fcb25cf

Verified against the chain, not the broadcast log: the old Lens reverts on one
raw unit of collateral and the new one answers `never liquidatable`; the four
live markets read identically through both.

## One test is red on purpose

`test_knownRed_twapPoolRingCannotHoldTheOracleWindow` asserts the three TWAP
pools carry enough observation slots for their window. They do not — 300 to 360
against 1,800 — and that is the unfunded item below, not a regression. It is
named so nobody spends an afternoon on it, and it turns green the moment
`grow-twap-rings.sh --send` has run and the swaps have caught up.

## Still open, and why

**The Safe has to sign twice.** `acceptOwnership()` on the new FlashLiquidator
— it is `Ownable2Step`, so until the Safe accepts, the deploy key owns a contract
that holds nothing and has no borrows to earn from. And `submitGuardian` on the
vault, which needs an address only the operator can choose: it has to be one that
has never been in plaintext, and it must not be the owner.

**The TWAP rings are unfunded.** HIMS 360, PONS 300, CASHCAT 360 observation
slots against an 1,800-second window, measured on chain. At 22,414 gas a slot
that is 0.077 ETH for all three. Not urgent — all three markets are capped at
zero with no supply and no borrows, and the constructor check refuses any new
listing in this state — but the cheapest of the three pools can be pushed into
reverting for about $65 an hour, so it should not stay this way once they list.

**The old keeper key is lost.** 0xc2478f68… held 0.00998 ETH and its key lived in
the launcher script that the `rsync --delete` removed. It is not recoverable. The
replacement, 0x61b134A8…, is generated on the VPS into the env file — which
nothing execs and nothing syncs over — authorised on the new liquidator, and
funded.
