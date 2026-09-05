# Robinhood Chain facts for stockborrow (M0 discovery)

Measured 2026-09-02/03 against `https://rpc.mainnet.chain.robinhood.com` (block ~52,951,750).
Script: `contracts/script/ChainFacts.s.sol`, log probes with `cast logs` (see below).

## Network

| | |
|---|---|
| Chain id | 4663 |
| Block time | ~214 ms measured over 3M blocks (docs say ~100 ms) |
| Public RPC | pruned, no archive state (`eth_call --block N` fails with "metadata is not found"); `eth_getLogs` works over 200k-block ranges |
| Archive | needs Alchemy `robinhood-mainnet` or publicnode token. Fork tests at a pinned block therefore need an archive URL |
| Explorer API | `https://robinhoodchain.blockscout.com/api/` sits behind Cloudflare; do not put it in `[etherscan]`, pass verifier flags on the CLI |

## Tokens

| Token | Address | Decimals | Notes |
|---|---|---|---|
| USDG | 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 | **6** | supply 543M |
| WETH | 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 | 18 | |
| NVDA | 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC | 18 | supply 57,758 tokens |
| TSLA | 0x322F0929c4625eD5bAd873c95208D54E1c003b2d | 18 | supply 8,476 |
| SPY | 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C | 18 | supply 17,263 |
| AAPL | 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9 | 18 | supply 14,070; `uiMultiplier` = 1.000566 (dividend applied, `effectiveAt` in the past) |
| HIMS | 0xCceE82fE024c36fA15E1005edE3E9e4787e23D09 | 18 | supply 73,318; no Chainlink feed found yet |

All stock tokens expose `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()`, `oraclePaused()`. Raw balances are untouched by corporate actions.

## Chainlink feeds (proxy → aggregator), 8 decimals

| Feed | Proxy | Aggregator |
|---|---|---|
| RHNVDA/USD | 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15 | 0xC9d16E4f2569b9E3ea0468fD85844953713DC2a2 |
| RHTSLA/USD | 0x4A1166a659A55625345e9515b32adECea5547C38 | 0x7A6b81ba7FbCB90104d8C496158Cf383cD7233b1 |
| RHSPY/USD | 0x319724394D3A0e3669269846abE664Cd621f9f6A | 0x78BCB218fA04B9b3a278eBc865Ed320BF8DEFBAc |
| Robinhood AAPL/USD | 0x6B22A786bAa607d76728168703a39Ea9C99f2cD0 | 0xBb11A21267cFDb63d4935d99a499133DD1744ACb |
| ETH/USD | 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9 | |

### Weekend behavior (the important finding)

`AnswerUpdated` events on the NVDA aggregator between Fri 2026-08-28 ~18:30 UTC and Mon 2026-08-31 13:33 UTC: **none**.
First Monday update 13:33 UTC (09:33 ET). Updates then continue through the overnight session (Tue 00:16 UTC, 08:24 UTC), so the feed follows the 24/5 window, not the 9:30–16:00 cash session.
SPY updated only 3 times between Fri and Tue 18:46 UTC (Tue 00:00, 08:38, 18:46 UTC): the 86,400 s heartbeat from the Chainlink directory is **not** honored while the market is closed, and a quiet ticker can go days without an update even on trading days.

Consequences for `StockOracle`:
- The Chainlink price is "last NYSE-session price". Treat it as valid for up to `hardAge` = 5 days (long weekends), never as a freshness guarantee.
- `softAge` (2 h) only flags "weekend mode" for the UI and keeper.
- The DEX TWAP is not optional: it is the only live price for ~65 h every week.

## Uniswap v3 (real factory)

The canonical factory slot 0x1F98…F984 holds 2 KB of unrelated code. The real factory, from `SwapRouter02.factory()`, is **0x1f7d7550B1b028f7571E69A784071F0205FD2EfA** (49 KB).
SwapRouter02: 0xCaf681a66D020601342297493863E78C959E5cb2.

| Pair | Fee | Pool | Liquidity (L) | Obs. cardinality |
|---|---|---|---|---|
| NVDA/WETH | 500 | 0x62AB521f71431f78ac374CdbadC6cda3c8916b6C | 1.5e22 | 1400 |
| NVDA/WETH | 3000 | 0xC0Be1cb0f674D9737C72B2A63fC542361185b807 | 1.9e21 | 1500 |
| NVDA/USDG | 500 | 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3 | 6.9e18 | 6000 |
| NVDA/USDG | 3000 | 0xB944cec30Bd4175855215D767ADC81F39e5f7E2B | 3.4e16 | 1500 |
| TSLA/WETH | 3000 | 0xA953CA88ff430e9487c60cA34d757414f4efdA07 | 1.8e21 | 60 |
| TSLA/USDG | 3000 | 0xf4ACdAEEB7022862A763C9B1B885e11191c889E3 | 2.7e17 | 1801 |
| SPY/WETH | 500 | 0xDDCBBa3666f578E3F09516f21Ff85BFee859AB5e | 1.2e23 | 1400 |
| SPY/USDG | 500 | 0xa7Bb1AC63BBaB0C44316E6c8C455213441689167 | 1.5e18 | 1801 |
| AAPL/WETH | 500 | 0x8bb3514e2204E1cDF3Ac149EFEe7Ff04D91B719f | 2.2e21 | 1400 |
| AAPL/USDG | 500 | 0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D | 3.1e18 | 1801 |
| HIMS/WETH | 3000 | 0xeB576c467d69E084A0fDc6dDf744467804634650 | 1.6e19 | **1** |
| HIMS/USDG | 3000 | 0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64 | 5.1e18 | 200 |
| USDG/WETH | 100 | 0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca | 6.0e18 | |
| USDG/WETH | 500 | 0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a | 9.7e17 | |

Direct stock/USDG pools with cardinality ≥ 1500 exist for NVDA, TSLA, SPY, AAPL, so the v1 oracle TWAP path is **stock/USDG pool directly**, no ETH/USD hop.
HIMS needs `increaseObservationCardinalityNext` on the USDG pool (anyone can call it) before a 30-min TWAP is reliable.
Uniswap v4: PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951 (no built-in TWAP; v4-only tickers deferred).

## Still open

- L2 sequencer uptime feed address: not found; oracle keeps an optional slot.
- Float exclusions (issuer/bridge holders): to be derived in the indexer from top holders.
- 1inch quote coverage for stock tokens: check in keeper phase.
- Relative depth of v3 pools vs v4 and Rialto propAMM: matters for liquidator routing, not for v1 contracts.

---

## Cluby additions (measured 2026-09-04, block ~54.37M)

### The public RPC gates `eth_call` on a User-Agent header
`https://rpc.mainnet.chain.robinhood.com` answers `eth_chainId` with no headers, but returns
**403 Forbidden for `eth_call`** unless the request carries a non-empty `User-Agent` — any value
works. Node's fetch sends none, so a viem client reads chain id fine and then fails every contract
read, which looks like an application bug and is not one. `apps/web/src/lib/chain.ts` sets the
header explicitly. Blockscout behaves the same way; it is not Cloudflare-blocked with a UA set.

### Morpho Blue stack, verified by `eth_getCode`
| Contract | Address | Code |
|---|---|---|
| Morpho Blue | `0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010` | 15,582 bytes |
| AdaptiveCurveIRM | `0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1` | 2,282 bytes |
| ChainlinkOracleV2Factory | `0xB7c16F6F8cF531447Bf27Ca7220f981E79C9cdF2` | 4,464 bytes |

The vault factory (MetaMorpho V1.1 / Vault V2), Bundler3, PreLiquidationFactory and PublicAllocator
are **not** at their Ethereum or Base addresses here — probed, all empty. A vault therefore needs our
own deploy of the MetaMorpho V1.1 factory from Morpho sources.

### Ticker squatting is worse than 30 per ticker, and the beacon is the answer
Reading `symbol()` across every USDG counterparty on both Uniswap versions — 4,416 on v3 and 57,923
on v4 — finds **257 tokens called PONS**, 93 CASHCAT, 81 AI, 29 NOTHING, 23 INDEX. Only one of each
holds any money.

For a tokenized stock the question is settled outright, and not by `uiMultiplier()`. Every real one
is a `BeaconProxy` whose ERC-1967 beacon slot
(`0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`) holds
`0xe10b6f6b275De231345C20d14aB812dB62151b00`. Scanning `BeaconUpgraded` for that beacon
**enumerates** the population — 203 tokens, no duplicate symbols, byte-identical runtime code — so a
squatter cannot appear in it and a real token cannot be missed. Checking the slot on a candidate is
the whole verification.

`uiMultiplier()` (selector `0xa60bf13d`) still works as a weaker check and agrees with the beacon on
all 203; the fake SPCX at `0xd6a1232c3403dCaaE4f65Dc76Ee3C40528A51D2B` reverts on it and carries no
beacon. But **`0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046` is not a deployer** despite being recorded
as one: it is itself an ERC-1967 proxy, and computing CREATE addresses from its nonces 1…210 yields
zero live contracts. It cannot enumerate and it cannot check.

**Twelve tokens carry a `uiMultiplier` other than 1, not one.** An earlier version of this file said
SGOV was the only one while its own table three sections above recorded AAPL at 1.000566. The full
list, largest first: CRWD 4.0, WEEK 2.0062, CCL 1.0215, SGOV 1.0051, ORCL 1.0022, UPS 1.0022,
COST 1.00061, AAPL 1.00057, F 1.00015, ASML 1.00010, MU 1.000075, DELL 1.000064.

### Feeds
Every Chainlink description resolves through **two** proxy addresses to the same aggregator: same
answers, different round ids (phase 1 vs phase 2). Pin the one recorded in `packages/config`.
Descriptions follow three inconsistent naming schemes (`RHMSFT / USD`, `Robinhood GOOGL / USD`,
`Robinhood SGOV-USD`), so never pattern-match them. The registry holds 113 proxies over 56 distinct
feeds, from deployer `0xfE3c266C0F994f9552b70D9107214Fe0ED0d74d8`.

Feeds added to `packages/config` beyond the original five: MSFT, QQQ, GOOGL, AMZN, META, SGOV, SPCX.
**No feed exists for PONS, CASHCAT or INDEX** — checked against the whole registry, not a failed
lookup — so those markets can only be priced by TWAP.

### Pools and TWAP readiness
Cardinality is the constraint, not liquidity:
- QQQ's deepest USDG pool (fee 500) carries cardinality 300; the fee-3000 pool is the safer source.
- SGOV's fee-500 pool has real liquidity but cardinality 1.
- INDEX's only pool has **cardinality 1** — no TWAP of any length is possible until
  `increaseObservationCardinalityNext` has been called and the window has filled.

TWAP reads over a 30-minute window agree with pool spot within 0.9% (HIMS $27.58 vs $27.61,
PONS $0.7466 vs $0.7532, CASHCAT $0.2589 vs $0.2605), which is the check that the tick decoding and
the decimal handling are right.

### Morpho only accepts LLTVs its governance enabled
`isLltvEnabled` on `0x9D53…1010`, checked 2026-09-04:

| LLTV | enabled |
|---|---|
| 0, 38.5%, 62.5%, 77%, 86%, 91.5%, 94.5%, 96.5%, 98% | yes |
| 66.7%, 70%, 80% | **no** |

`createMarket` reverts with `LLTV not enabled` for anything else, which is how PLAN §1A.2's 70%
tier for TWAP-backed megacaps and its 66.7% short tier (150% coverage) were found to be
unavailable. Both are pinned down to 62.5% — the nearest enabled value below the intended one, so
the substitution is conservative: positions liquidate earlier and borrow less, never the reverse.

### The short-market oracle is the long oracle inverted, not a re-parameterised one
A short market has USDG as collateral and the stock as the borrowed asset. Its oracle must still be
built the long way round (stock as base, USDG as quote) and then wrapped in `InverseOracle`. Passing
the short market's own decimals to Morpho's factory inverts them a second time and produces a price
10^24 too small — `4.32e21` instead of `4.32e45` for NVDA at $231.46 — which still looks like a
price and would silently misprice every position. Pinned by `test_shortOracleMagnitude`.

### A `uiMultiplier` is not in the Chainlink oracle path — and SGOV is not the only one affected
Morpho's Chainlink factory prices the FEED, which quotes one share, not the TOKEN, which may be
worth more than one. So the multiplier is dropped: the market values the collateral below what it is
worth. That is the safe direction — understated, never overstated — but it is not free.

Of the markets listed today, five are Chainlink-priced with a multiplier above 1: SGOV 0.51%,
COST 0.061% (TWAP-priced, so unaffected), AAPL 0.057%, ASML 0.010%, MU 0.0075%, DELL 0.0064%. Only
SGOV's is material, and only SGOV's GROWS, because the fund accrues. A composed oracle is needed
before its cap is raised to anything that matters; the rest are noise for now and worth re-reading
before they are not.

A TWAP prices the token itself and therefore carries the multiplier for free. That is a real
argument for the pool-based path on any token whose multiplier drifts.

### The RPC returns wrong answers under load, silently
Twice during deployment a single `eth_getBalance` came back as zero and a `price()` call as empty,
on both the archive and the public endpoint, with no error — and both were correct on an immediate
retry. Anything recorded from one unverified read can therefore be wrong in a way nothing downstream
will catch: market ids, oracle addresses and balances are all read twice or cross-checked against a
second source before being written into `packages/config`.
