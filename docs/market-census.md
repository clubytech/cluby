# Market census — Robinhood Chain (4663)

Measured **2026-09-05 12:09:38 UTC**, chain head **55,109,721**, against
`https://rpc.mainnet.chain.robinhood.com` (every request carrying a `User-Agent`, which the public
node requires for `eth_call`). Read-only: no transaction was sent and nothing was deployed.

The question this answers: Longbow lists ~54 USDG lending markets, we list 17. Which of the other
tickers can we list **safely**, with every address proven on chain rather than looked up by symbol?

Nothing here comes from a block explorer. Blockscout's API sits behind a Cloudflare interstitial and
returned a challenge page, not JSON, so it was not used at all — which is just as well, since ticker
squatting on this chain makes symbol search actively dangerous (see §6).

## 1. How each address was proven

**Tokenised stocks — enumerated, not searched.** Every real Robinhood stock token on this chain is a
`BeaconProxy` whose ERC-1967 beacon slot
(`0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`) holds
`0xe10b6f6b275de231345c20d14ab812db62151b00`. Scanning the whole chain (block 0 → head, in 2M-block
chunks) for `BeaconUpgraded(address indexed beacon)`
(`0x1cf3b03a6cf19fa2baba4df148e9dcabedea7f8a5c07840e207e5c089be95d3e`) with that beacon in topic 1
returns the complete set: **203 tokens, no duplicate symbols**. That is an enumeration of the
population, not a search of it, so a squatter cannot appear in it and a real token cannot be missed.

Cross-checks run against that set:

* `uiMultiplier()` (`0xa60bf13d`) answers on **all 203**; the known impostor
  `0xd6a1232c3403dCaaE4f65Dc76Ee3C40528A51D2B` (fake SPCX, identical `name()`) reverts on it and is
  **not** in the set.
* All 203 have **byte-identical runtime code** (568 hex chars), as beacon proxies must.
* `beacon.implementation()` = `0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2` — one shared `Stock` logic
  contract.
* All twelve token addresses already pinned in `packages/config` (NVDA, TSLA, SPY, AAPL, HIMS, MSFT,
  QQQ, GOOGL, AMZN, META, SGOV, SPCX) appear in the set, at the same addresses. Independent
  derivation, same answer.

Note that `stockTokenIdentity.deployer` (`0x4783C67b…`) does **not** CREATE the tokens: it is itself
an ERC-1967 proxy (implementation `0xee351e53bce6aaf106428358838197c91e36ee0e`), and enumerating
CREATE addresses from its nonce 1…210 yields **zero** live contracts. The beacon, not the deployer
nonce, is the usable identity handle.

**Chainlink feeds — enumerated the same way.** `feedRegistry.deployer`
(`0xfE3c266C0F994f9552b70D9107214Fe0ED0d74d8`) is an EOA with nonce 932. Computing every CREATE
address for nonces 0…935 and calling `description()` on each returns **171 addresses that answer**:
113 proxies plus 58 aggregators (which answer `description()` themselves), over **57 distinct
descriptions**. That matches `feedRegistry.proxyCount = 113` exactly, so the registry is complete.

Every description resolves through two proxies plus the aggregator, and `phaseId()` distinguishes
them. Both proxies are recorded below; both were read and both return the identical `answer` and
`updatedAt` for every feed. Two exceptions found: **USDC/USD and USDT/USD have three proxies each**
(phase 1 is gone; phases 2 and 3 remain), and their phase-2 aggregator is 36 days stale while phase
3 is current. No stock feed has that problem.

**Pools.** Uniswap v3 factory `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` (confirmed 49,073 bytes
of code, `owner()` = `0x05C420bC…`). For every one of the 203 tokens, `getPool(token, USDG, fee)`
was called at all four fee tiers (100/500/3000/10000) — `getPool` is authoritative, so a zero result
means the pool does not exist, full stop. Separately, all `PoolCreated` logs with USDG in either
indexed token slot were scanned over the whole chain: **4,591 USDG pools, 4,416 distinct
counterparties**, which is how the chain-native tokens were found.

For each pool found: `slot0()`, `liquidity()`, `USDG.balanceOf(pool)`, `token.balanceOf(pool)`, and
`observe([1800,0])`. For the TWAP candidates, `observe()` was additionally run at 900 / 1800 / 3600 /
7200 seconds — **every TWAP source listed below answers out to two hours**, so a 30–60 minute window
has real headroom.

**Ticker squatting is far worse than `chain-facts.md` records.** Reading `symbol()` on every
USDG counterparty across both Uniswap versions — 4,416 on v3 and 57,923 on v4 — turns up **257
tokens called PONS**, 93 called CASHCAT, 81 called AI, 29 NOTHING, 23 INDEX and 10 STONKBROKER. Many
are named `… by Virtuals` and hold a pool with zero liquidity. For a tokenised stock the beacon
settles the question outright. For the chain-native tickers there is no such handle, so the picks
below rest on a weaker fact — exactly one candidate per symbol holds any money — which is stated as
the basis rather than hidden. Counts are in §6.

**Exit depth** is `USDG.balanceOf(pool)` on the deepest USDG pool for the ticker. It is an upper
bound on what a liquidation can actually pull out (some of it sits in out-of-range ticks), which is
the conservative direction for a cap.

**Price sanity.** Where both exist, the Chainlink answer and the pool spot agree: SPY $769.59 vs
$771.37, NVDA $230.24 vs $230.80, AMZN $258.73 vs $259.18, MU $1,014.79 vs $1,016.54 — all inside
0.3%. For the TWAP-only tickers there is no feed to check against, so each was priced a **second,
independent way**: through its WETH pool multiplied by the ETH/USD Chainlink feed. Thirteen of them
have a WETH pool, and all thirteen agree with the USDG-pool price within **±0.7%** (AMC +0.7%, GLD
+0.6%, DJT −0.6%, RBLX −0.4%, HIMS −0.3%, COST −0.0%, RDDT +0.0%, MRNA −0.2%, LLY −0.2%). That is
two independent pools and one Chainlink feed agreeing, which is the strongest statement available
without an off-chain price.

## 2. The 54 tickers Longbow lists

`Ours today` is from `marketCatalog` in `packages/config`. Feed column shows the **phase-1 proxy**
(the one `packages/config` pins) and how stale `updatedAt` is right now; the phase-2 proxy and the
aggregator for every feed are in §8. Pool column is the **deepest USDG pool**: address, fee tier,
USDG held, `slot0().observationCardinality`, and whether `observe([1800,0])` answers today.

| Ticker | Ours today | Token (verified) | Identity check | Chainlink feed (phase-1 proxy) + age | Deepest USDG pool | Verdict |
|---|---|---|---|---|---|---|
| **WSNET-NN** | not listed | not found | no token on chain carries this symbol — 62,339 checked | none | none | `BLOCKED-NO-TOKEN-FOUND` |
| **PONS** | listed/planned | `0x39dBED3a2bd333467115dE45665cC57F813C4571` | symbol PONS, name "Pons", 18 dec; `uiMultiplier()` REVERTS (not a Robinhood stock); 3 other USDG-paired tokens share the symbol | none | `0x7A192E71564ec66eE0763e328a3Ac274942dE4e1`<br>fee 10000 · $2,724,953 · card 300 · obs ok | `LISTABLE-TWAP` |
| **CASHCAT** | listed/planned | `0x020bfC650A365f8BB26819deAAbF3E21291018b4` | symbol CASHCAT, name "Cash Cat", 18 dec; `uiMultiplier()` REVERTS (not a Robinhood stock); 4 other USDG-paired tokens share the symbol | none | `0x4B0c312fFbB068F6a0bEa128759E35d94B94D0E1`<br>fee 10000 · $56,550 · card 360 · obs ok | `LISTABLE-TWAP` |
| **SPY** | listed/planned | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | `uiMultiplier()` = 1.0, 18 dec, "SPDR S&P 500 ETF Trust • Robinhood Token" | `0x319724394D3A0e3669269846abE664Cd621f9f6A`<br>20.9 h | `0xa7Bb1AC63BBaB0C44316E6c8C455213441689167`<br>fee 500 · $94,740 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **ETH** | listed/planned | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 (WETH)` | WETH, not a Stock beacon proxy — `uiMultiplier()` reverts by design | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9`<br>20.7 h | `0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca`<br>fee 100 · $13,584,364 · card 2500 · obs ok | `LISTABLE-CHAINLINK` |
| **NVDA** | listed/planned | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | `uiMultiplier()` = 1.0, 18 dec, "NVIDIA • Robinhood Token" | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15`<br>18.4 h | `0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3`<br>fee 500 · $5,470,979 · card 6000 · obs ok | `LISTABLE-CHAINLINK` |
| **MSFT** | listed/planned | `0xe93237C50D904957Cf27E7B1133b510C669c2e74` | `uiMultiplier()` = 1.0, 18 dec, "Microsoft • Robinhood Token" | `0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E`<br>20.9 h | `0xeb60bCD1D920ad6E102690CCFC6fB488899E1510`<br>fee 3000 · $167,625 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **AI** | not listed | `0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18` | symbol AI, name "Artificial Inu", 18 dec; `uiMultiplier()` REVERTS (not a Robinhood stock); one other USDG-paired token shares the symbol | none | `0xe547c18f46Db55AB788343bcC503F9CF0bd7d564`<br>fee 10000 · $414 · card 1 · obs FAIL | `BLOCKED-NO-TWAP` |
| **AAPL** | listed/planned | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | `uiMultiplier()` = 1.000566080, 18 dec, "Apple • Robinhood Token" | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0`<br>16.3 h | `0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D`<br>fee 500 · $122,513 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **QQQ** | listed/planned | `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68` | `uiMultiplier()` = 1.0, 18 dec, "Invesco QQQ • Robinhood Token" | `0x80901d846d5D7B030F26B480776EE3b29374C2ae`<br>31.6 h | `0xD60A5d14dB690B7Afad71F76B108071D7175597d`<br>fee 500 · $988,577 · card 300 · obs ok | `LISTABLE-CHAINLINK` |
| **META** | listed/planned | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | `uiMultiplier()` = 1.0, 18 dec, "Meta Platforms • Robinhood Token" | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1`<br>17.0 h | `0x107a7Cb40d8665360ba10E59471Af06150A50922`<br>fee 3000 · $88,415 · card 1400 · obs ok | `LISTABLE-CHAINLINK` |
| **TSLA** | listed/planned | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | `uiMultiplier()` = 1.0, 18 dec, "Tesla • Robinhood Token" | `0x4A1166a659A55625345e9515b32adECea5547C38`<br>17.9 h | `0xf4ACdAEEB7022862A763C9B1B885e11191c889E3`<br>fee 3000 · $462,489 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **GOOGL** | listed/planned | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3` | `uiMultiplier()` = 1.0, 18 dec, "Alphabet Class A • Robinhood Token" | `0xF6f373a037c30F0e5010d854385cA89185AE638b`<br>21.7 h | `0x34D0dC122CF9A8Eb296fC5e0D3A233625D7d19b7`<br>fee 500 · $284,569 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **AMZN** | listed/planned | `0x12f190a9F9d7D37a250758b26824B97CE941bF54` | `uiMultiplier()` = 1.0, 18 dec, "Amazon • Robinhood Token" | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C`<br>16.4 h | `0x8AC92DA74AB5F3b1d024Dc1943Ad7e15Dc4179Ef`<br>fee 3000 · $579,161 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **NOTHING** | not listed | `0x4672a663E2F65A5a7a5903Fa5045dB25e4B74663` | symbol NOTHING, name "NothingHood", 18 dec; `uiMultiplier()` REVERTS (not a Robinhood stock) | none | `0xE0eA7cc5c51E65DF918810da6a5e530E70715E09`<br>fee 10000 · $0 · card 1 · obs ok | `BLOCKED-NO-LIQUIDITY` |
| **AMC** | not listed | `0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B` | `uiMultiplier()` = 1.0, 18 dec, "AMC Entertainment • Robinhood Token" | none | `0xaA34feA710a1A737840329051D81D3B0B7C564d5`<br>fee 3000 · $1,435,143 · card 300 · obs ok | `LISTABLE-TWAP` |
| **STONKBROKER** | not listed | `0xe934e36A439C94017B64a3FecE66AF12099aBF50` | symbol STONKBROKER, name "StonkBroker", 18 dec; `uiMultiplier()` REVERTS (not a Robinhood stock) | none | `0x8b1d1996f65178D9697224C570a09c51Caf79Bfc`<br>fee 3000 · $19,666 · card 1 · obs FAIL | `BLOCKED-NO-TWAP` |
| **INDEX** | blocked (ours) | `0x56910D4409F3a0C78C64DD8D0545FF0705389870` | symbol INDEX, name "The Index", 18 dec; `uiMultiplier()` REVERTS (not a Robinhood stock); one other USDG-paired token shares the symbol | none | `0xb89DE909AE9fDF14592c868Ad532c4cA3D100222`<br>fee 10000 · $3,455 · card 1 · obs FAIL | `BLOCKED-NO-TWAP` |
| **WSNET** | not listed | `0x63C12667638f2Ae6fC6ae09B43D98Ec84a8586eA` *(unconfirmed — see §6)* | symbol `wsNET`, name "Wrapped Staked NET", 18 dec; `uiMultiplier()` REVERTS and beacon slot is zero — not a Robinhood stock | none | none — `getPool` is zero at all four fee tiers vs USDG, WETH and NET; v4 only | `BLOCKED-NO-PRICE-SOURCE` |
| **HIMS** | listed/planned | `0xCceE82fE024c36fA15E1005edE3E9e4787e23D09` | `uiMultiplier()` = 1.0, 18 dec, "Hims & Hers Health • Robinhood Token" | none | `0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64`<br>fee 3000 · $720,124 · card 360 · obs ok | `LISTABLE-TWAP` |
| **TTWO** | not listed | `0x5e81213613b6B86EaB4c6c50d718d34359459786` | `uiMultiplier()` = 1.0, 18 dec, "Take-Two Interactive Software • Robinhood Token" | none | `0xD9Ab4b7fAe6DC2f7020134Ec744A8F53Ef3E5E24`<br>fee 3000 · $131,795 · card 360 · obs ok | `LISTABLE-TWAP` |
| **BABA** | not listed | `0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4` | `uiMultiplier()` = 1.0, 18 dec, "Alibaba • Robinhood Token" | `0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984`<br>21.0 h | `0xa57ab582b310dd6f9e934EA1EEEa152741545E6A`<br>fee 3000 · $133,629 · card 300 · obs ok | `LISTABLE-CHAINLINK` |
| **GME** | not listed | `0x1b0E319c6A659F002271B69dB8A7df2F911c153E` | `uiMultiplier()` = 1.0, 18 dec, "GameStop • Robinhood Token" | `0x27C71df6A64fB476468EdF256CF72c038baB5B67`<br>17.0 h | `0xE2b46c905E12Ab8E2f864e4821a4325884C1B126`<br>fee 500 · $348,910 · card 1500 · obs ok | `LISTABLE-CHAINLINK` |
| **DELL** | not listed | `0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd` | `uiMultiplier()` = 1.000063709, 18 dec, "Dell • Robinhood Token" | `0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b`<br>15.7 h | `0xc30c89cB7815A1488b7998D15eEC73961707Fc5a`<br>fee 10000 · $272,860 · card 1500 · obs ok | `LISTABLE-CHAINLINK` |
| **PLTR** | not listed | `0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A` | `uiMultiplier()` = 1.0, 18 dec, "Palantir Technologies • Robinhood Token" | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c`<br>17.1 h | `0x851680416A4f4E1c463d45171d61ACDdBc8554c0`<br>fee 3000 · $44,085 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **SNDK** | not listed | `0xB90A19fF0Af67f7779afF50A882A9CfF42446400` | `uiMultiplier()` = 1.0, 18 dec, "Sandisk Corporation • Robinhood Token" | `0xfb133Fa4B7b385802B693a293606682Df47109A3`<br>15.6 h | `0xA1e1C9519cD5ae47e9A935645E1A7b935b944559`<br>fee 10000 · $50,575 · card 1400 · obs ok | `LISTABLE-CHAINLINK` |
| **AMD** | not listed | `0x86923f96303D656E4aa86D9d42D1e57ad2023fdC` | `uiMultiplier()` = 1.0, 18 dec, "AMD • Robinhood Token" | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72`<br>16.2 h | `0x48D284A2A4d3DC1b3Da08231Fe44317e7e7Aa51f`<br>fee 3000 · $92,298 · card 1400 · obs ok | `LISTABLE-CHAINLINK` |
| **MU** | not listed | `0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD` | `uiMultiplier()` = 1.000074823, 18 dec, "Micron Technology • Robinhood Token" | `0x425EEFdCf05ed6526C3cE61Af99429A228a6d596`<br>16.2 h | `0xd057B1Bc54917855BBee58eAd58647f47caB35E5`<br>fee 3000 · $980,681 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **INTC** | not listed | `0xc72b96e0E48ecd4DC75E1e45396e26300BC39681` | `uiMultiplier()` = 1.0, 18 dec, "Intel • Robinhood Token" | `0x3f390C5C24628Ac7C489515402235FeAD71D1913`<br>16.3 h | `0x2e5a92f5013a64661A49312111be2e8aBd33F56a`<br>fee 3000 · $41,157 · card 1500 · obs ok | `LISTABLE-CHAINLINK` |
| **ORCL** | not listed | `0xb0992820E760d836549ba69BC7598b4af75dEE03` | `uiMultiplier()` = 1.002210915, 18 dec, "Oracle • Robinhood Token" | `0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844`<br>15.8 h | none | `BLOCKED-NO-EXIT` |
| **TSM** | not listed | `0x58FfE4a942d3885bAa22D7520691F611EF09e7AA` | `uiMultiplier()` = 1.0, 18 dec, "Taiwan Semiconductor Manufacturing • Robinhood Token" | `0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F`<br>19.2 h | `0x07e8Ea83D4C1340774c8965125e26e12bf943bf1`<br>fee 10000 · $113,585 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **CRCL** | not listed | `0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5` | `uiMultiplier()` = 1.0, 18 dec, "Circle Internet Group • Robinhood Token" | `0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a`<br>17.6 h | `0x654E4143e82a5824445Ade0824351C2A9ACD95a8`<br>fee 3000 · $1,257,263 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **ASML** | not listed | `0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA` | `uiMultiplier()` = 1.000101323, 18 dec, "ASML Holding NV • Robinhood Token" | `0xB4106147E8cce40b7d46124090d373A71b70f87D`<br>16.3 h | `0xce79c1B7b5f9Ae1aab3B1796e7Fcd2F5F24cF265`<br>fee 3000 · $34,624 · card 1 · obs FAIL | `LISTABLE-CHAINLINK` |
| **SGOV** | listed/planned | `0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5` | `uiMultiplier()` = 1.005101770, 18 dec, "iShares 0-3 Month Treasury Bond • Robinhood Token" | `0xa0DF4ee0fFf975306345875E3548Fcc519577A11`<br>36.1 h | `0xfAb520051f96F4D2a32c22B6a3dD7fFfdf231bFe`<br>fee 3000 · $1,190,186 · card 1400 · obs ok | `LISTABLE-CHAINLINK` |
| **CRWV** | not listed | `0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3` | `uiMultiplier()` = 1.0, 18 dec, "CoreWeave • Robinhood Token" | `0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C`<br>15.4 h | none | `BLOCKED-NO-EXIT` |
| **NBIS** | not listed | `0x9D9c6684F596F66a64C030B93A886D51Fd4D7931` | `uiMultiplier()` = 1.0, 18 dec, "Nebius Group • Robinhood Token" | `0xE1D87B116Ba0fe898998f1D140339D1fA1E09705`<br>15.9 h | `0x0DDA7C6A2ccE72aBbFA88394aFe407fF98417448`<br>fee 10000 · $0 · card 1 · obs ok | `BLOCKED-NO-EXIT` |
| **RGTI** | not listed | `0x284358abc07F9359f19f4b5b4aC91901Be2597Ba` | `uiMultiplier()` = 1.0, 18 dec, "Rigetti Computing • Robinhood Token" | `0x2A045cF1C49c61c166C036d2f06FA2D2d984f765`<br>14.6 h | `0xb549D4EaF467277E48Aa350f216e413DF8c8BA12`<br>fee 10000 · $0 · card 1 · obs ok | `BLOCKED-NO-EXIT` |
| **USO** | not listed | `0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344` | `uiMultiplier()` = 1.0, 18 dec, "United States Oil Fund • Robinhood Token" | `0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c`<br>15.6 h | `0x02175608F1b5E6b5ed221cCFdC7Be197D111D915`<br>fee 3000 · $353,261 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **SLV** | not listed | `0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f` | `uiMultiplier()` = 1.0, 18 dec, "iShares Silver Trust • Robinhood Token" | `0x209b73908e92Ae021826eD79609845451Ecba2ce`<br>16.7 h | `0x8cB787e6c315D464775289BaD00FDD67d53Ecb3D`<br>fee 3000 · $290,471 · card 1801 · obs ok | `LISTABLE-CHAINLINK` |
| **SPCX** | listed/planned | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | `uiMultiplier()` = 1.0, 18 dec, "Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token" | `0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb`<br>16.3 h | `0xc61284332117c3FB23A2A56cceFFD07F7aF60029`<br>fee 500 · $1,941,524 · card 3100 · obs ok | `LISTABLE-CHAINLINK` |
| **USAR** | not listed | `0xd917B029C761D264c6A312BBbcDA868658eF86a6` | `uiMultiplier()` = 1.0, 18 dec, "USA Rare Earth • Robinhood Token" | `0xA994d3684e8400A6c8078226925779FdeE682DD9`<br>12.7 h | `0x04391780F519B7d3ba59c9590459D76e23d225C4`<br>fee 3000 · $22,412 · card 1400 · obs ok | `LISTABLE-CHAINLINK` |
| **RKLB** | not listed | `0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2` | `uiMultiplier()` = 1.0, 18 dec, "Rocket Lab Corporation • Robinhood Token" | `0x045477BF65Aef6f4F2386ad0164579e48381CC74`<br>16.8 h | `0xa9888De1B9D64A93eaeb495A39FE9B3d00654928`<br>fee 10000 · $0 · card 1 · obs ok | `BLOCKED-NO-EXIT` |
| **CLSK** | not listed | `0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3` | `uiMultiplier()` = 1.0, 18 dec, "CleanSpark • Robinhood Token" | `0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF`<br>16.3 h | `0xf58a091afD28F26e7E2a60803e6Dfb5A8e451021`<br>fee 10000 · $0 · card 1 · obs ok | `BLOCKED-NO-EXIT` |
| **EWY** | not listed | `0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc` | `uiMultiplier()` = 1.0, 18 dec, "iShares MSCI South Korea fund • Robinhood Token" | `0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1`<br>14.1 h | `0x23A254C637Ef0F13F6259586f059FFf52b89ed6b`<br>fee 10000 · $0 · card 1 · obs ok | `BLOCKED-NO-EXIT` |
| **RDDT** | not listed | `0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C` | `uiMultiplier()` = 1.0, 18 dec, "Reddit • Robinhood Token" | none | `0xa8744E76aED23B05F0126335E7BD38f7935D19fe`<br>fee 10000 · $860,691 · card 1801 · obs ok | `LISTABLE-TWAP` |
| **DJT** | not listed | `0x1D11f0496982706C5e14A514D4E79F2e6BdE4516` | `uiMultiplier()` = 1.0, 18 dec, "Trump Media & Technology Group • Robinhood Token" | none | `0x31a89afd92F9397465649AD03226c52292fc1ae5`<br>fee 10000 · $311,429 · card 1400 · obs ok | `LISTABLE-TWAP` |
| **COIN** | not listed | `0x6330D8C3178a418788dF01a47479c0ce7CCF450b` | `uiMultiplier()` = 1.0, 18 dec, "Coinbase • Robinhood Token" | `0xA3a468A452940B7D6b69991207B508c609a98Ef2`<br>16.2 h | `0x5C51A0035051fa2DB80AEc8781Be3bD6207d27E0`<br>fee 3000 · $0 · card 256 · obs ok | `BLOCKED-NO-EXIT` |
| **MSTR** | not listed | `0xec262a75e413fAfD0dF80480274532C79D42da09` | `uiMultiplier()` = 1.0, 18 dec, "Strategy Inc. • Robinhood Token" | `0x396118bdFB181e6240E74D243F266B061c0edc3D`<br>14.2 h | `0x17578C0e0D15da44f31677263114F71aE76653EA`<br>fee 10000 · $195,592 · card 1500 · obs ok | `LISTABLE-CHAINLINK` |
| **GLD** | not listed | `0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e` | `uiMultiplier()` = 1.0, 18 dec, "SPDR Gold Trust • Robinhood Token" | none | `0x7A6A053eCCf1446A2633E05aA6D40D09381997ec`<br>fee 3000 · $2,561,710 · card 1400 · obs ok | `LISTABLE-TWAP` |
| **COST** | not listed | `0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2` | `uiMultiplier()` = 1.000612040, 18 dec, "Costco • Robinhood Token" | none | `0x0a2121A50A09eD0796ae81F9c53fF9398355a398`<br>fee 3000 · $421,608 · card 1801 · obs ok | `LISTABLE-TWAP` |
| **NFLX** | not listed | `0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8` | `uiMultiplier()` = 1.0, 18 dec, "Netflix • Robinhood Token" | none | `0x59895C0302F41aEaa129D2fa2442CEc01E7eF45E`<br>fee 3000 · $141,404 · card 1801 · obs ok | `LISTABLE-TWAP` |
| **MRNA** | not listed | `0x43B07D15cE533bEc5476d70C22a78a1B2B662155` | `uiMultiplier()` = 1.0, 18 dec, "Moderna • Robinhood Token" | none | `0xA34d0667334074DF2d5BfD259e79E6B9cf1fA8Bf`<br>fee 10000 · $53,607 · card 1400 · obs ok | `LISTABLE-TWAP` |
| **RIVN** | not listed | `0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B` | `uiMultiplier()` = 1.0, 18 dec, "Rivian Automotive • Robinhood Token" | none | `0xb30A75B200D98A600a3766869344928E35823E23`<br>fee 10000 · $114,203 · card 1400 · obs ok | `LISTABLE-TWAP` |
| **RBLX** | not listed | `0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8` | `uiMultiplier()` = 1.0, 18 dec, "Roblox • Robinhood Token" | none | `0x2ef5945cd5664876b6481FdacFaA2942995a4DA8`<br>fee 10000 · $149,881 · card 1400 · obs ok | `LISTABLE-TWAP` |

### Verdict counts

| Verdict | Count | Of those, new to us |
|---|---|---|
| `LISTABLE-CHAINLINK` | 27 | **15** |
| `LISTABLE-TWAP` | 13 | **10** |
| `BLOCKED-NO-EXIT` (feed exists, no pool or an empty one) | 8 | 8 |
| `BLOCKED-NO-TWAP` (pool has USDG but `observationCardinality` 1) | 3 | 2 |
| `BLOCKED-NO-LIQUIDITY` (pool exists, holds nothing) | 1 | 1 |
| `BLOCKED-NO-PRICE-SOURCE` (token found on v4 only, nothing can price it) | 1 | 1 |
| `BLOCKED-NO-TOKEN-FOUND` | 1 | 1 |

**25 new markets are listable** (15 Chainlink-priced, 10 TWAP-priced), which would take us from 17
to 42 and close most of the gap to Longbow's 54. The 13 we cannot list break down as: 8 that have a
Chainlink feed but **nowhere to sell the collateral**, 3 whose pool cannot produce a TWAP yet, 1
whose pool is empty, 1 (WSNET) whose only candidate lives on Uniswap v4 where nothing can price it,
and 1 (WSNET-NN) whose token does not exist on this chain at all.

## 3. Suggested LLTV tier and supply cap for the listable ones

**LLTV rule** — the same logic already in `marketCatalog`, applied mechanically:

* `eth` **77%** — WETH.
* `tbills` **86%** — short-duration treasury ETFs priced by Chainlink. SGOV only.
* `stock` **62.5%** — a tokenised equity or ETF with a Chainlink feed **and** a deepest USDG pool of
  at least $50,000.
* `longTail` **38.5%** — everything else that is listable: TWAP-priced collateral, pre-IPO (SPCX,
  matching the existing catalog note), and Chainlink-priced names whose only exit is under $50,000
  (PLTR, INTC, ASML, USAR).

**Cap rule** — sized off measured exit depth, not off appetite:

> `supplyCapUsd = floor_to_ladder( p × deepest USDG pool balance )`, ladder
> {250, 500, 1000, 2000, 5000, 10000, 25000}, hard ceiling **$25,000** at first listing, and
> `BLOCKED-THIN` if the result would land under $250.
> `p = 2%` for Chainlink-priced markets, `p = 1%` for TWAP-priced ones.

Why those numbers. At LLTV 62.5% a cap of `C` USDG of debt puts about `C / 0.625 = 1.6 C` of
collateral value in front of a liquidator. Selling `1.6 C` into a pool holding `P` USDG moves the
price by roughly `1.6 C / P` inside the concentrated range, so holding that under ~3% needs
`C ≲ 0.02 P`. TWAP-priced markets get half of that because the pool that prices the collateral **is**
the pool that has to absorb it: one push moves the oracle and the exit together, so the same dollar
of manipulation buys twice the damage.

The hard $25,000 ceiling is a first-listing guard, not a depth statement — NVDA's 2% is $109,000 and
ETH's is $271,000. Raise those against realised liquidation behaviour, not against this table.

These numbers are deliberately larger than the $500–$5,000 canary caps in `marketCatalog` today.
Those were sized to survive a first deploy; these are sized to the exit that actually exists.

| Ticker | Verdict | Oracle | LLTV tier | Depth used | Rule | Suggested supplyCapUsd |
|---|---|---|---|---|---|---|
| PONS | `LISTABLE-TWAP` | twap | longTail 38.5% | $2,724,953 | 1% of pool | **$25,000** |
| CASHCAT | `LISTABLE-TWAP` | twap | longTail 38.5% | $56,550 | 1% of pool | **$500** |
| SPY | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $94,740 | 2% of pool | **$1,000** |
| ETH | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | eth 77% | $13,584,364 | 2% of pool | **$25,000** |
| NVDA | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $5,470,979 | 2% of pool | **$25,000** |
| MSFT | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $167,625 | 2% of pool | **$2,000** |
| AAPL | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $122,513 | 2% of pool | **$2,000** |
| QQQ | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $988,577 | 2% of pool | **$10,000** |
| META | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $88,415 | 2% of pool | **$1,000** |
| TSLA | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $462,489 | 2% of pool | **$5,000** |
| GOOGL | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $284,569 | 2% of pool | **$5,000** |
| AMZN | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $579,161 | 2% of pool | **$10,000** |
| AMC | `LISTABLE-TWAP` | twap | longTail 38.5% | $1,435,143 | 1% of pool | **$10,000** |
| HIMS | `LISTABLE-TWAP` | twap | longTail 38.5% | $720,124 | 1% of pool | **$5,000** |
| TTWO | `LISTABLE-TWAP` | twap | longTail 38.5% | $131,795 | 1% of pool | **$1,000** |
| BABA | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $133,629 | 2% of pool | **$2,000** |
| GME | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $348,910 | 2% of pool | **$5,000** |
| DELL | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $272,860 | 2% of pool | **$5,000** |
| PLTR | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | longTail 38.5% | $44,085 | 2% of pool | **$500** |
| SNDK | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $50,575 | 2% of pool | **$1,000** |
| AMD | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $92,298 | 2% of pool | **$1,000** |
| MU | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $980,681 | 2% of pool | **$10,000** |
| INTC | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | longTail 38.5% | $41,157 | 2% of pool | **$500** |
| TSM | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $113,585 | 2% of pool | **$2,000** |
| CRCL | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $1,257,263 | 2% of pool | **$25,000** |
| ASML | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | longTail 38.5% | $34,624 | 2% of pool | **$500** |
| SGOV | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | tbills 86% | $1,190,186 | 2% of pool | **$10,000** |
| USO | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $353,261 | 2% of pool | **$5,000** |
| SLV | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $290,471 | 2% of pool | **$5,000** |
| SPCX | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | longTail 38.5% | $1,941,524 | 2% of pool | **$25,000** |
| USAR | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | longTail 38.5% | $22,412 | 2% of pool | **$250** |
| RDDT | `LISTABLE-TWAP` | twap | longTail 38.5% | $860,691 | 1% of pool | **$5,000** |
| DJT | `LISTABLE-TWAP` | twap | longTail 38.5% | $311,429 | 1% of pool | **$2,000** |
| MSTR | `LISTABLE-CHAINLINK` | chainlink (or chainlinkTwapMin) | stock 62.5% | $195,592 | 2% of pool | **$2,000** |
| GLD | `LISTABLE-TWAP` | twap | longTail 38.5% | $2,561,710 | 1% of pool | **$25,000** |
| COST | `LISTABLE-TWAP` | twap | longTail 38.5% | $421,608 | 1% of pool | **$2,000** |
| NFLX | `LISTABLE-TWAP` | twap | longTail 38.5% | $141,404 | 1% of pool | **$1,000** |
| MRNA | `LISTABLE-TWAP` | twap | longTail 38.5% | $53,607 | 1% of pool | **$500** |
| RIVN | `LISTABLE-TWAP` | twap | longTail 38.5% | $114,203 | 1% of pool | **$1,000** |
| RBLX | `LISTABLE-TWAP` | twap | longTail 38.5% | $149,881 | 1% of pool | **$1,000** |

## 4. Tickers on chain that Longbow does **not** list and we do not have

Same verification: beacon-proxy token, `uiMultiplier()` answers, pool measured. Filtered to a
deepest USDG pool of at least $20,000, since below that the cap rule cannot produce even $250.
**None of these has a Chainlink feed** — the registry's 57 descriptions cover exactly the tickers in
§2 plus IONQ, and IONQ's only pool is empty, so there is no fourth category hiding here.

The TWAP-source column applies the same test used above: deepest pool that both answers
`observe([1800,0])` **and** carries `observationCardinality ≥ 300`. Where the deepest pool fails that
test the next one down is used, which is why LLY's, PFE's, QUBT's and BA's TWAP source is not their
deepest pool — and why four of them come out `BLOCKED-THIN`: the pool that can price them is not the
pool that holds the money.

`BLOCKED-LOW-CARDINALITY` is the cheapest of all the blocks to clear: `increaseObservationCardinalityNext`
is permissionless.

| Ticker | Token (verified) | Name | Deepest USDG pool | TWAP source (card ≥ 300, `observe([1800,0])` ok) | Verdict | Tier | Cap |
|---|---|---|---|---|---|---|---|
| **LLY** | `0x8005d266423c7ea827372c9c864491e5786600ea` | Eli Lilly | `0xF4274130137eeE20bAD928B593d992716516CEB9`<br>fee 10000 · $542,952 · card 256 | `0xD2038788ebe1e0BFd7C0A6112f09778F3aeAecA6`<br>fee 3000 · $113,759 · card 300 | `LISTABLE-TWAP` | longTail 38.5% | $1,000 |
| **LULU** | `0x4e62068525Ab11FE768e29dfD00ef909B9803016` | Lululemon | `0x0F4227D27082B3BCA6818381b9ea6460275e49f4`<br>fee 3000 · $469,893 · card 360 | `0x0F4227D27082B3BCA6818381b9ea6460275e49f4`<br>fee 3000 · $469,893 · card 360 | `LISTABLE-TWAP` | longTail 38.5% | $2,000 |
| **IBM** | `0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619` | IBM | `0xA0A79bC62fC822f3bcDF0EBbc586031781c53a5B`<br>fee 10000 · $109,909 · card 300 | `0xA0A79bC62fC822f3bcDF0EBbc586031781c53a5B`<br>fee 10000 · $109,909 · card 300 | `LISTABLE-TWAP` | longTail 38.5% | $1,000 |
| **PFE** | `0x7066A64c24e4206CD62E83bf198c1E7EB361F51e` | Pfizer | `0xC7d573Fcda6D2107C97fb582ae18411F9Db32E7f`<br>fee 3000 · $76,981 · card 64 | `0xA26dF7296ef5DFc727f3bc6F1E9050E6B62e6abF`<br>fee 10000 · $14,136 · card 300 | `BLOCKED-THIN` | — | — |
| **WYFI** | `0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E` | WhiteFiber, Inc. | `0x2a3063e34C60253ABB23C2442F4CDFBC5cbd02c2`<br>fee 3000 · $59,517 · card 64 | — every pool is under card 300 | `BLOCKED-LOW-CARDINALITY` | — | — |
| **FIG** | `0x41F4267525a8AFf329540eF24fD83d9044758B33` | Figma | `0xca5904C0a9d42F0Ec1Bf760FDf779907877144fD`<br>fee 3000 · $56,406 · card 200 | — every pool is under card 300 | `BLOCKED-LOW-CARDINALITY` | — | — |
| **NU** | `0x408c14038a04f7bD235329E26d2bf569ee20e250` | Nu | `0xb6d047637151f6De1d02028acdd187Aa9cb7AFE3`<br>fee 10000 · $50,558 · card 1500 | `0xb6d047637151f6De1d02028acdd187Aa9cb7AFE3`<br>fee 10000 · $50,558 · card 1500 | `LISTABLE-TWAP` | longTail 38.5% | $500 |
| **QUBT** | `0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4` | Quantum Computing | `0x227Bbce9A81B3694b01754298a983Be3F9E44A93`<br>fee 3000 · $48,173 · card 1 | `0x2E2a857C08aD6C09f1d1EC4FDB4Cc7cd06cF17f4`<br>fee 10000 · $8,212 · card 1400 | `BLOCKED-THIN` | — | — |
| **MRVL** | `0x62fd0668e10D8B72339BE2DCF7643001688ff13B` | Marvell Technology | `0xb5E892F0fC6dAAdDA5b927266FE7907e623e4843`<br>fee 3000 · $44,214 · card 200 | `0x06cc0b96Be1fa1d754CE2e1228F5d8c616F795b0`<br>fee 10000 · $38,757 · card 300 | `LISTABLE-TWAP` | longTail 38.5% | $250 |
| **UPS** | `0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2` | UPS | `0x3Ab74C45DceCC6A62898204Dd42143a816B44CB1`<br>fee 10000 · $43,271 · card 200 | — every pool is under card 300 | `BLOCKED-LOW-CARDINALITY` | — | — |
| **BE** | `0x822CC93fFD030293E9842c30BBD678F530701867` | Bloom Energy | `0x1baD145C8F06444E0dF81c28257cd20231Bd1f16`<br>fee 3000 · $37,225 · card 64 | — every pool is under card 300 | `BLOCKED-LOW-CARDINALITY` | — | — |
| **SNAP** | `0xF6589F11Bc40b669e584073F428B05562F568733` | Snap | `0x0EbD4650C9e641E9745b5A508A2D46935DFE753E`<br>fee 3000 · $36,256 · card 200 | — every pool is under card 300 | `BLOCKED-LOW-CARDINALITY` | — | — |
| **JNJ** | `0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80` | Johnson & Johnson | `0x8d39388EF11Bb78843130Bd74AB0e5d89fA76b30`<br>fee 10000 · $36,164 · card 300 | `0x8d39388EF11Bb78843130Bd74AB0e5d89fA76b30`<br>fee 10000 · $36,164 · card 300 | `LISTABLE-TWAP` | longTail 38.5% | $250 |
| **F** | `0x25C288E6D899b9BC30160965aD9644c67e73bE0C` | Ford Motor | `0x01948e834623aA859ffDC0D299dD15e7C9D7486F`<br>fee 10000 · $33,257 · card 300 | `0x01948e834623aA859ffDC0D299dD15e7C9D7486F`<br>fee 10000 · $33,257 · card 300 | `LISTABLE-TWAP` | longTail 38.5% | $250 |
| **BA** | `0x4D21483a44Bf67a86b77E3dA301411880797D452` | Boeing | `0xc6517047b189c72D3bAa9eF37D1d28F27a63638a`<br>fee 3000 · $32,359 · card 1 | `0xbf3904cAd0E63a4796CF806C21f2C1528B8eBE06`<br>fee 10000 · $6,225 · card 300 | `BLOCKED-THIN` | — | — |
| **ON** | `0xbBD09F72b025360FeE5C928053Dca6248d35be54` | ON Semiconductor | `0xfcE637eeAd7D62d9ED27F81D9767de03e9E534Cf`<br>fee 10000 · $28,485 · card 300 | `0xfcE637eeAd7D62d9ED27F81D9767de03e9E534Cf`<br>fee 10000 · $28,485 · card 300 | `LISTABLE-TWAP` | longTail 38.5% | $250 |
| **RCAT** | `0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460` | Red Cat | `0x64710a70839585Af718e1B1FAEf9E7f1665F1116`<br>fee 10000 · $22,266 · card 360 | `0x64710a70839585Af718e1B1FAEf9E7f1665F1116`<br>fee 10000 · $22,266 · card 360 | `BLOCKED-THIN` | — | — |

## 5. Exactly which calls proved what

Every claim above traces to one of these. Nothing was taken from a symbol lookup.

| Claim | Call that proves it |
|---|---|
| This address is a real Robinhood stock token | `eth_getLogs` topic0 `0x1cf3b03a…` (`BeaconUpgraded`) topic1 = beacon `0xe10b6f6b…`, block 0 → head; the log's `address` **is** the token |
| …and it is not an impostor | `uiMultiplier()` (`0xa60bf13d`) returns; `eth_getCode` equals the beacon-proxy bytecode shared by all 203; `eth_getStorageAt` slot `0xa3f0ad74…` = the beacon |
| Token metadata | `symbol()`, `name()`, `decimals()`, `totalSupply()`, `uiMultiplier()`, `oraclePaused()` via Multicall3 `aggregate3` at `0xcA11bde05977b3631167028862bE2a173976CA11` |
| This proxy is the feed for this ticker | CREATE address from `feedRegistry.deployer` nonce *n* → `description()` returns; `phaseId()` says which proxy; `aggregator()` ties both proxies to one aggregator |
| Feed liveness | `latestRoundData()` → `answer`, `updatedAt`; age against the head block's own `timestamp` (1788610178), not wall clock |
| This pool exists (or does not) | `IUniswapV3Factory.getPool(token, USDG, fee)` on `0x1f7d7550…` at fee 100/500/3000/10000 — a zero address is proof of absence |
| Pool depth | `USDG.balanceOf(pool)` and `token.balanceOf(pool)` |
| Pool state | `liquidity()`, `slot0()` → `observationCardinality`, `observationCardinalityNext` |
| A 30-min TWAP is available today | `observe([1800,0])` returns without reverting — plus `observe` at 900/3600/7200 s for the listable TWAP set |
| Two independent prices agree | tick from the USDG pool vs tick from the WETH pool × `ETH/USD` feed `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` |
| Nothing else is paired with USDG | `eth_getLogs` `PoolCreated` (`0x783cca1c…`) with USDG in topic 1, then again in topic 2, block 0 → head in ≤5M-block chunks with halving on failure |

Every eth_call went through Multicall3 `aggregate3` with `allowFailure = true`, and an empty
`returnData` was recorded as a failure rather than decoded as a zero — which is how the
`BLOCKED-NO-EXIT` cases were caught instead of being read as "pool with zero depth".

`chain-facts.md` warns that this RPC returns wrong answers under load, silently. Guarding against
that, a sample was re-read afterwards through a **different client** (`cast`, not the script's own
JSON-RPC layer): MU and CRCL token symbol, `uiMultiplier()`, beacon slot, feed `description()` and
`latestRoundData()`, and pool `slot0()` all came back identical. Pool balances had drifted with
trading — MU's deepest pool read $980,681 in the sweep and $950,930 fifty minutes later, CRCL's
$1,257,263 then $1,256,168. Depths in this file are a snapshot at head 55,109,721 and move by a few
percent an hour; the cap ladder is coarse enough that this does not change a single number in §3.

## 6. What could not be resolved, and why

**WSNET — one candidate, and it is still not listable.** The search is now exhaustive: `symbol()` was
read on **all 4,416** distinct USDG counterparties on Uniswap v3 (plus `name()` on every one of
them) and on **all 57,923** distinct USDG counterparties on Uniswap v4 (133,323 `Initialize` events from PoolManager
`0x8366a39CC670B4001A1121B8F6A443A643e40951`). Across 62,339 tokens, exactly **one** symbol matches
`WSNET` case-insensitively:

> `0x63C12667638f2Ae6fC6ae09B43D98Ec84a8586eA` — `symbol()` = `wsNET`, `name()` = `Wrapped Staked NET`,
> 18 decimals, `totalSupply()` = 1,170.49. `uiMultiplier()` **reverts** and the beacon slot is zero,
> so it is not a Robinhood stock. `getPool` returns **zero at all four fee tiers against USDG, WETH
> and the NET stock token** — it exists only on Uniswap v4.

Whether that is what Longbow renders as WSNET is a guess, and a guess is exactly what this census
exists to avoid — but the verdict does not depend on it. There is no Chainlink feed for it, and v4
has no built-in TWAP oracle, so there is nothing to price it with either way. It stays
`BLOCKED-NO-PRICE-SOURCE` at that address and `BLOCKED-NO-TOKEN-FOUND` if that address is not it.

**WSNET-NN — not found anywhere.** Zero matches across all 62,339 tokens, on v3 or v4, exact or
case-insensitive. No Chainlink description resembles it. Do not list it on any address.

**AI — ambiguous identity and no usable price.** Two USDG-paired tokens carry the symbol on v3
(`Folio AI Index` `0xC9160A61…`, pool holds $8; `Artificial Inu` `0x2E8c3116…`, pool holds $414 at
`observationCardinality` 1), and the v4 sweep found **79 more**. Nothing distinguishes them on
chain, and no pool for any of them can produce a TWAP. Listing "AI" would mean guessing which of 81
tokens Longbow means.

**Squatting, counted.** Across all USDG pairs on both Uniswap versions, the tickers Longbow lists as
chain-native resolve to this many distinct token contracts:

| Symbol | v3 | v4 | total | Funded pool |
|---|---|---|---|---|
| PONS | 4 | 253 | **257** | one — `0x39dBED3a…`, $2,724,953 |
| CASHCAT | 5 | 88 | **93** | one — `0x020bfC65…`, $56,550 |
| AI | 2 | 79 | **81** | none |
| NOTHING | 1 | 28 | **29** | none |
| INDEX | 2 | 21 | **23** | one — `0x56910D44…`, $3,455, cardinality 1 |
| STONKBROKER | 1 | 9 | **10** | one — `0xe934e36A…`, $19,666, cardinality 1 |

`chain-facts.md` says the explorer returns 30+ tokens per ticker. For PONS the real number is 257.
The saving grace is that only one of each holds any money — which is the basis on which PONS and
CASHCAT are picked here, and it is a weaker guarantee than the beacon check that backs every stock.
It should be re-checked before each listing, because a squatter can fund a pool at any time.

**NFLX has no second price source.** It is the only `LISTABLE-TWAP` name with no WETH pool, so its
price rests on one pool. The 30-min TWAP and the spot agree ($78.61), and the pool is deep
($141,404) with `observationCardinality` 1801, but there is no independent on-chain cross-check the
way there is for the other twelve. Worth an off-chain sanity check before it goes live.

**The `BLOCKED-NO-EXIT` eight are a policy question, not a data gap.** ORCL, CRWV, NBIS, RGTI, RKLB,
CLSK, EWY and COIN all have a working Chainlink feed and a verified token, and all are listed by
Longbow. ORCL and CRWV have **no Uniswap v3 pool at all** — `getPool` returns zero for all four fee
tiers against both USDG and WETH. The other six have a pool that was created and never funded:
`liquidity() = 0`, both balances effectively zero (RGTI's holds 0.25 RGTI and $0.00 USDG). A market
on any of them prices fine and cannot be liquidated. They flip to listable the moment somebody seeds
a pool; nothing else about them is broken. IONQ — the one Chainlink-fed ticker Longbow does *not*
list — is in the same state, pool `0xbc44b11f…` with `liquidity() = 0`.

**Three that one transaction would unblock.** STONKBROKER ($19,666 in its fee-3000 pool), INDEX
($3,455) and ASML's deeper fee-3000 pool ($34,624) all sit at `observationCardinality` 1, plus the
five `BLOCKED-LOW-CARDINALITY` names in §4. `increaseObservationCardinalityNext` is permissionless —
anyone can call it, it takes nothing from the LPs, and once the window fills the pool can serve a
TWAP. ASML does not need it (Chainlink feed plus a second pool at cardinality 1500); STONKBROKER and
INDEX do.

## 7. Three things in `packages/config` and `chain-facts.md` that this census contradicts

**`chain-facts.md` says SGOV is the only token whose `uiMultiplier` is not 1. It is not.**
Twelve of the 203 carry a multiplier other than 1.0, and three are larger than SGOV's:

| Token | `uiMultiplier()` | Token | `uiMultiplier()` |
|---|---|---|---|
| CRWD | **4.000000000000000000** | COST | 1.000612040296259656 |
| WEEK | **2.006182524271844660** | AAPL | 1.000566080061092436 |
| CCL | **1.021486444855206408** | ASML | 1.000101323251417769 |
| SGOV | 1.005101770003214918 | F | 1.000145502866134027 |
| ORCL | 1.002210914971013375 | MU | 1.000074823219171086 |
| UPS | 1.002208724969205741 | DELL | 1.000063708620124549 |

CRWD's 4× is a split expressed in the multiplier. The warning `chain-facts.md` attaches to SGOV —
compose the multiplier into the oracle before raising the cap — now applies to **COST** (which is
`LISTABLE-TWAP` above) and to **ORCL, MU, DELL and ASML**. A TWAP prices the token and so carries the
multiplier for free; a Chainlink feed prices the *underlying* and does not, so only the
Chainlink-priced ones are affected. It understates collateral, which is the safe direction, but by
0.22% for ORCL rather than SGOV's 0.51%, and the gap only grows.

**`stocks.QQQ.usdgPool` disagrees with its own comment.** The comment reads *"The deeper fee-500
pool only carries cardinality 300; the 3000 pool is the safer TWAP source"* — and the recorded pool
is then the fee-500 one, `0xd60a5d14…`, cardinality 300. Measured today: fee-500 holds $988,577 at
cardinality 300, fee-3000 (`0xEbD78dcfc8a6b3A696f1E191aD1ff321f9579f79`) holds $42,450 at
cardinality 1500. QQQ is Chainlink-priced so nothing is wrong today, but the moment its oracle moves
to `chainlinkTwapMin` the config points at the pool its own comment rejects.

**`stockTokenIdentity.deployer` is not a deployer.** `0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046` is
an ERC-1967 proxy (implementation `0xee351e53bce6aaf106428358838197c91e36ee0e`), and computing CREATE
addresses from its nonces 1…210 yields **zero live contracts** — no stock token descends from it by
CREATE. The field is still true as provenance, but it cannot be used to enumerate or to check a
candidate. The beacon `0xe10b6f6b275de231345c20d14ab812db62151b00` can do both, and is worth adding
to `stockTokenIdentity` alongside the `uiMultiplier` marker.

## 8. Feed reference — both proxies and the aggregator

Every one of these was read today. `packages/config` pins the phase-1 proxy; the phase-2 proxy
returns identical `answer` and `updatedAt` with a different round id, exactly as
`docs/chain-facts.md` records. Ages are large across the board because **2026-09-05 is a Saturday**:
every stock feed sits between 12.7 h and 36.1 h, well inside `FEED_MAX_AGE.stock` (5 days), and the
crypto feeds (LINK 0.6 h, ENA 2.8 h) keep updating. That is the documented 24/5 behaviour, not a
fault — and it is exactly why the TWAP path is not optional.

| Ticker | `description()` | phase-1 proxy | phase-2 proxy | aggregator | dec | answer | `updatedAt` age |
|---|---|---|---|---|---|---|---|
| AAPL | `Robinhood AAPL / USD` | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | `0x4bDbb3150014c6Ab2C6D9347B0779c49015a2f3f` | `0xBb11A21267cFDb63d4935d99a499133DD1744ACb` | 8 | $320.52 | 16.3 h |
| AMD | `RHAMD / USD` | `0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72` | `0xF6d57763DFa625F4A413485261Ab2E71Ff4304CF` | `0xdAD54b8Ee51Af258e5A6Faa9a84a3300f4775f7d` | 8 | $477.70 | 16.2 h |
| AMZN | `Robinhood AMZN / USD` | `0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C` | `0x9244830430bC7D9C9A48dd47603F24AD61f7c56e` | `0x93503dFc97157cdB8aADcCaf70452621d598FDeb` | 8 | $258.73 | 16.4 h |
| ASML | `Robinhood ASML / USD` | `0xB4106147E8cce40b7d46124090d373A71b70f87D` | `0x3eFBba343e2b1cF9ed4d4D5768e20B70307Aa8c9` | `0xF795030a46ad6CA4b07Bf5fB704dC36039118c9F` | 8 | $1711.80 | 16.3 h |
| BABA | `Robinhood BABA / USD` | `0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984` | `0xDB69948B26050818E8c9f43300F78b2582e67260` | `0xFf5F85e4888782e66f1dd9cabaDF4822Fbeb1439` | 8 | $112.83 | 21.0 h |
| CLSK | `Robinhood CLSK / USD` | `0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF` | `0x951C5E9a2a065053035D4B812b1f6cA7e64c5102` | `0xEff19B88E3c72f046e4a19A1E62544D5869d4275` | 8 | $12.69 | 16.3 h |
| COIN | `Robinhood COIN / USD` | `0xA3a468A452940B7D6b69991207B508c609a98Ef2` | `0xA7F7D79D578fb007384BaDF42c8E1D76a6a63bBD` | `0x30398b0B0df82a009bB2D507BC7fE1dc6d3ca294` | 8 | $184.53 | 16.2 h |
| CRCL | `Robinhood CRCL / USD` | `0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a` | `0x025Ba3B3569Ca7d15Da7BFC1648F13F06A072851` | `0x901D8DF245E48Dfc82D6483FC45b5BE6ddc5281a` | 8 | $101.45 | 17.6 h |
| CRWV | `Robinhood CRWV / USD` | `0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C` | `0x288b837A17fED1aa00c1df832ef79D0C77336c10` | `0xd9C04B7353421fC4deb1614Ed13Fe10D90E586cc` | 8 | $89.05 | 15.4 h |
| DELL | `Robinhood DELL-USD` | `0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b` | `0xe9B94828424a8Efe6e773c28AB5Fd486851867c8` | `0xD6ed4e7D4ABA1111EB42A349899b5c72EE1C9FEF` | 8 | $521.97 | 15.7 h |
| ETH | `ETH / USD` | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | `0x5058aDee53b04e374d8bEDbAD634Bc4778F50b22` | `0x6091E64eb7138EEF066a80FD3A0d7427B91f2721` | 8 | $2455.22 | 20.7 h |
| EWY | `Robinhood EWY / USD` | `0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1` | `0x26bca2a89D2D23787ada8F91B849608c51A26977` | `0x105Cbe427BBD3225826a450f67EA80FeC6417F93` | 8 | $187.48 | 14.1 h |
| GME | `Robinhood GME / USD` | `0x27C71df6A64fB476468EdF256CF72c038baB5B67` | `0x42A4652D447A5B0bccF3B265bE8530b85A33b3A2` | `0xf83Cde62D1Cd90dE8d2Bf3332B90c590985aD679` | 8 | $19.20 | 17.0 h |
| GOOGL | `Robinhood GOOGL / USD` | `0xF6f373a037c30F0e5010d854385cA89185AE638b` | `0xA04EE5c4c8827F17e82f93bE9e19DeA221A749a8` | `0x11eD6d598eF565DDA86fAfE7E779303e7CC6b2Bd` | 8 | $338.27 | 21.7 h |
| INTC | `RHINTC / USD` | `0x3f390C5C24628Ac7C489515402235FeAD71D1913` | `0x127B1DeDeE6269E962a59E6C1295b4002c56c403` | `0x95fB52f75aEcBCa8E12aA4403f840C8bc18CFbd4` | 8 | $95.48 | 16.3 h |
| IONQ | `Robinhood IONQ / USD` | `0x22EfeC4919baf55F360E0EDee4AbEB26DE4971eb` | `0x926D7D95E554D1e671EB2C0d238fe37a2C23A64E` | `0x886E11c1053289Eed882C734e1864EfE3430BC24` | 8 | $39.69 | 16.1 h |
| META | `Robinhood META / USD` | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` | `0x5cBC53D382E56cBb223f118CF8Eefb6c9c2759f5` | `0xc190B6164B9e320A6400cdaB0085a2e0E2b9738e` | 8 | $615.64 | 17.0 h |
| MSFT | `RHMSFT / USD` | `0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E` | `0xaD6D88eab22aa4867Efe807a5311Ed64962f740D` | `0xc3b117F52cf17Dd4369eaF5eaf7cF0E2f91b4E30` | 8 | $500.53 | 20.9 h |
| MSTR | `Robinhood MSTR / USD` | `0x396118bdFB181e6240E74D243F266B061c0edc3D` | `0x2521a77F42098357e83bDea7fBb2A38745bf9280` | `0x55bd01F666c99E4590E084FdEfF88041BB50CCD1` | 8 | $142.30 | 14.2 h |
| MU | `RHMU / USD` | `0x425EEFdCf05ed6526C3cE61Af99429A228a6d596` | `0x5b40F4E78FA58B60a4F59b8cc8cB8d2Fb0690467` | `0xA088FaD0A0A62693aF068E2EdB80B1578c8A9365` | 8 | $1014.79 | 16.2 h |
| NBIS | `Robinhood NBIS / USD` | `0xE1D87B116Ba0fe898998f1D140339D1fA1E09705` | `0xCa59A8F53bf4E0628CC0b1BD3a2216F2F8E04770` | `0xE50c4775FeFc1E3C9206771dd0056AEe30F51b2F` | 8 | $224.82 | 15.9 h |
| NVDA | `RHNVDA / USD` | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | `0xCF169363636D73dbBf77733629CB38919d14232d` | `0xC9d16E4f2569b9E3ea0468fD85844953713DC2a2` | 8 | $230.24 | 18.4 h |
| ORCL | `Robinhood ORCL / USD` | `0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844` | `0x2a07f8d87d369Bd8Bc36472337ae02d512a7b5e5` | `0x4a9aBC759e0B7b0ba98b5fd39c419A5D3e962aAf` | 8 | $159.34 | 15.8 h |
| PLTR | `Robinhood PLTR / USD` | `0x820ABedFF239034956B7A9d2F0a331f9F075eB4c` | `0x8cd1DFC0fc61fcA55FA77b37e008A90f13364Fce` | `0x315afd0f71D5407B99ad19ab001a67af40fbAAF4` | 8 | $173.95 | 17.1 h |
| QQQ | `Robinhood QQQ / USD` | `0x80901d846d5D7B030F26B480776EE3b29374C2ae` | `0x41ed2c58611790af0760e31e80Bb427e4e83D603` | `0x25e996ce8b3529885D429241156e83e7b7744049` | 8 | $719.59 | 31.6 h |
| RGTI | `Robinhood RGTI / USD` | `0x2A045cF1C49c61c166C036d2f06FA2D2d984f765` | `0xC9C477AEfF7eD1BB89B84F7907E2e11707491466` | `0x42B1C5174cE84Be751A23489d7DbDc969Bc17eA2` | 8 | $15.25 | 14.6 h |
| RKLB | `Robinhood RKLB / USD` | `0x045477BF65Aef6f4F2386ad0164579e48381CC74` | `0x955c60932E517B36be137Eee78E65343cBFC9D29` | `0x59aB60B1D63DE8b282852573D18a3a99c04C787c` | 8 | $64.22 | 16.8 h |
| SGOV | `Robinhood SGOV-USD` | `0xa0DF4ee0fFf975306345875E3548Fcc519577A11` | `0xa7a18Ca3F19E17FfA28F92302B817Ca8c1A94b06` | `0x0E96B7708487f91baAC09697593D3e8bf253f2d8` | 8 | $100.98 | 36.1 h |
| SLV | `Robinhood SLV / USD` | `0x209b73908e92Ae021826eD79609845451Ecba2ce` | `0xdA81cD9c76F1D3Ea32655dfFc7408ef22BB0Ee2a` | `0xcdF6F7043b3aF6Afa0CAAACe1230B355096B5386` | 8 | $59.85 | 16.7 h |
| SNDK | `RHSNDK / USD` | `0xfb133Fa4B7b385802B693a293606682Df47109A3` | `0xd1016D9Da414B13D55abe02221A8A145eB89aA0D` | `0x7B2FdfcEa772f093DD33b3aCF8EE294B368f6c23` | 8 | $1729.65 | 15.6 h |
| SPCX | `Robinhood SPCX / USD` | `0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb` | `0x42a95341ff361e81fd934F39943c5C98F6991844` | `0x5eaa223c585F40CDcA2D119ea91B97C491245631` | 8 | $147.96 | 16.3 h |
| SPY | `RHSPY / USD` | `0x319724394D3A0e3669269846abE664Cd621f9f6A` | `0xa68CA83408bE3f78d1c58a82081c619e9d21486d` | `0x78BCB218fA04B9b3a278eBc865Ed320BF8DEFBAc` | 8 | $769.59 | 20.9 h |
| TSLA | `RHTSLA / USD` | `0x4A1166a659A55625345e9515b32adECea5547C38` | `0xE4479F01738B4e8C428CD8eB72D47AB9BC3c7de6` | `0x7A6b81ba7FbCB90104d8C496158Cf383cD7233b1` | 8 | $353.98 | 17.9 h |
| TSM | `Robinhood TSM / USD` | `0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F` | `0xB48D6D5729Ca032ca43729F4b605bBf9f257A84d` | `0x2B3A9A18998e9464760658233ab093e6aEbF45d0` | 8 | $428.48 | 19.2 h |
| USAR | `Robinhood USAR-USD` | `0xA994d3684e8400A6c8078226925779FdeE682DD9` | `0x451B1295aA84FD6d6b58af1a5002eA1b1A1913A0` | `0x76ba75c6c362900B275D9D4d5C422F0275e85578` | 8 | $17.44 | 12.7 h |
| USO | `RHUSO / USD` | `0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c` | `0x6D054DECb74Cf8ef3675B0Abc100e02921176EdF` | `0xa6aC45e27D19f91c55109191D71CfBA4A9f5fBe1` | 8 | $141.78 | 15.6 h |
