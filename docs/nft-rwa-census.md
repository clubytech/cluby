# NFT and RWA census — Robinhood Chain (4663)

Measured **2026-09-05 15:01:25 UTC**, chain head **55,211,999** (block timestamp 1788620483), against
`https://rpc.mainnet.chain.robinhood.com`, every request carrying `user-agent: cluby-census/1.0`.
Read-only: no transaction was sent, nothing was deployed, no key was touched.

Two questions, asked because Longbow has two things we do not: an **NFT lending** page, and an **RWA**
filter on their markets list.

* **A. Are there NFT collections on this chain, and can any of them be priced?**
* **B. Is there RWA collateral here that is not an equity — treasuries, money-market, commodities, credit, FX?**
* **C. What is actually behind Longbow's NFT product?**

Short answers, expanded below: the chain is full of NFTs and **not one of them has any price source**;
there is exactly **one** genuinely new RWA token (`syrupUSDG`, private credit, Chainlink-priced) and it
is **not listable today** because its only market is Uniswap v4; and Longbow's NFT product has
**two loans in its history, for $12 and $48**.

`docs/market-census.md` is the companion file and the verification standard this one follows. Where a
fact was established there and re-read here, both readings are given. Blockscout was tried again and
still returns a Cloudflare interstitial rather than JSON, so nothing here comes from an explorer.

---

## A. NFTs on this chain

### A.1 How the population was enumerated, and where the RPC stops you

The clean route — every ERC-721 `Transfer` log has four topics, so filter `Transfer` and keep the
4-topic ones — does not survive contact with this node. Measured limits, each one an error message
returned by the RPC and not an assumption:

| Attempt | Result |
|---|---|
| `eth_getLogs` topic0 = `Transfer`, 50,000 blocks | `logs matched by query exceeds limit of 10000` |
| same, **5,000** blocks | `logs matched by query exceeds limit of 10000` |
| topic0 = `Transfer`, topic1 = `0x0` (mints), 10,000 blocks | `exceeds limit of 10000` |
| same, **2,000** blocks | 8,114 logs — of which **985** carry four topics, from 22 contracts |
| topic0 = `Transfer`, topic3 ∈ {tokenId 0…7} (the exact ERC-721 filter), 100,000 blocks | `log query timed out` — topic 3 is not indexed |
| topic0 = `ApprovalForAll`, 1,000,000 blocks | `log query timed out`; still timing out at 40,000 blocks in the dense regions |

So a complete ERC-721 enumeration is **not available** on this RPC, and this file says so rather than
implying one. Three things were done instead, and each is stated with its own scope:

1. **ERC-1155 — complete.** `TransferSingle`
   (`0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62`) and `TransferBatch`
   (`0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb`) are signatures nothing else
   emits, so a topic0 scan of the whole chain is an enumeration. Block 0 → head, 1M-block chunks
   halving on failure: **111,067 + 12,151 logs, 1,411 distinct contracts.**
2. **ERC-721 — sampled, uniformly, over the whole chain.** 220 windows of 2,000 blocks each, spaced
   evenly from block 0 to head, filtered to `Transfer` from the zero address with four topics. The
   numbers are in §A.3. Every contract found was then put through
   `supportsInterface(0x80ac58cd)`.
3. **The three collections Longbow names — verified individually** to the standard of §A.2, including
   an exact holder count from `ownerOf()` over the full token-id range.

### A.2 The three collections Longbow names

All three are real ERC-721 contracts, all three answer `supportsInterface(0x80ac58cd)` with `true`,
and all three have a genuine holder base. Holder counts are **exact, not estimated**: `ownerOf(id)`
was called for every id in the collection's whole range through Multicall3, and the owners counted.

| | Robinhood Punks | StonkBrokers | MonkeyHood |
|---|---|---|---|
| Address | `0xF08c65564eB07d880021105489552080b08e4319` | `0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0` | `0x6581B6fA83e714956935Cd1e16Ac8f6F5C44c484` |
| `name()` | Robinhood Punks | StonkBrokers | MonkeyHood |
| `symbol()` | **RPUNKS** | **STONK** | MonkeyHood |
| `totalSupply()` | 10,000 | 4,444 | **4,335** |
| `supportsInterface(0x80ac58cd)` ERC-721 | true | true | true |
| `supportsInterface(0xd9b67a26)` ERC-1155 | false | false | false |
| ERC-721 Enumerable / Metadata | true / true | false / true | false / true |
| ERC-2981 royalties | false | true | true |
| `owner()` | `0x3E0BfA7daAa01c6Da0A582222B0077021A8B0A75` | `0x17e9E0D951e9a52A697180119b90CE682E24C66f` | `0x210426297DC2c5c8c8Cfa219b6926c86a07228ef` |
| Token-id range (probed) | 0 … 9,999 | 0 … 4,443 | **519 … 11,219**, sparse |
| Ids with an owner | 10,000 | 4,444 | 4,335 |
| **Distinct holders** | **2,019** | **636** | **1,572** |
| Largest holder | 226 (2.3%) | **2,246 (50.5%)** — a contract, see below | 288 (6.6%) |
| Metadata | `ipfs://QmNhqn6hZ2…/1.json` | on-chain, `data:application/json;base64,…` | `tokenURI(1)` reverts (id 1 does not exist) |
| Code size | 11,110 B | 15,176 B | 21,337 B |
| Price source | **none** | **none** | **none** |

Three things in that table are worth pulling out.

**Longbow's own frontend disagrees with the chain in three places.** Their bundle
(`/assets/useNftActions-BxTFc56G.js`) carries the collection list as a hard-coded array:
`{address: 0xF08c…, name: "Robinhood Punks", symbol: "Punk", floorHint: 16, supply: 1e4}`,
`{address: 0x539C…, name: "StonkBrokers", symbol: "StonkBroker", floorHint: 23500, supply: 4444, isErc6551: true}`,
`{address: 0x6581…, name: "MonkeyHood", symbol: "MonkeyHood", floorHint: 50, supply: 4586, hidden: true}`.
On chain the symbols are `RPUNKS` and `STONK`, not `Punk` and `StonkBroker`, and MonkeyHood's
`totalSupply()` is **4,335**, not 4,586. MonkeyHood is flagged `hidden` and does not render on their
page at all.

**Half of StonkBrokers sits in one contract.** `0xe302733AcCF4800146E55FC45B46b4E4FFc032D2` holds
**2,246 of the 4,444** tokens. It is not a marketplace: an address-filtered scan of every log it has
ever emitted returns 7,507 logs, all of four internal types, of which the recurring one
(`0xcaeaf9a4a193647a35bc15d602eaaaff514f23ee9340d6295580ed33bf820731`) fires every ~18,000 blocks
carrying two `uint256`s that step from `3.995e18` to `4.222e18` over the sampled period — the shape of
a staking-reward accumulator, not a sale. 421 StonkBroker holders have granted it `ApprovalForAll`.
Whatever it is, the practical consequence for a lender is that the free float of StonkBrokers is
about 2,198 tokens across 635 addresses, not 4,444 across 636.

**"floorHint" is a constant in a JavaScript file.** It is not read from a contract, and there is no
contract on this chain it could be read from — see §A.4.

### A.3 The wider population — how many ERC-721 collections are really out there

220 windows of 2,000 blocks each, spread evenly from block 0 to head; **181 returned** (39 hit
`log query timed out` or the 10,000-log cap and are counted as missing, not as empty).

| | |
|---|---|
| Blocks sampled | **362,000** of 55,211,999 — **0.656%** of the chain |
| Distinct contracts that minted an ERC-721 in a sampled window | **1,595** |
| …of which `supportsInterface(0x80ac58cd)` returns true | **1,592** |
| …ERC-1155 among them | 0 |
| Seen in exactly one window / exactly two | 1,387 / 126 |
| Chao1 lower bound on the true population | **≈ 9,200** |

Read the Chao1 number as an order of magnitude, not a count — NFT minting comes in bursts, which
violates the estimator's independence assumption. The **1,592 is not an estimate**: every one of those
addresses answered `supportsInterface(0x80ac58cd)` with `true`. Two thirds of one percent of the chain
containing 1,592 distinct ERC-721 contracts is the fact that matters.

**ERC-1155, by contrast, was enumerated completely: 1,411 contracts** over the whole chain.

A separate pilot pass — 28 windows, 46,000 blocks — ran before the main sample and found 239
contracts, 148 of which the main sample did not see. Putting both together and re-checking every one:
**1,739 addresses on this chain answer `supportsInterface(0x80ac58cd)` with `true`**, out of 1,743
probed. That is the floor, and it is a measurement.

The long tail is what you would expect from the ticker-squatting documented in
`docs/market-census.md` §6, transposed to NFTs. The largest by `totalSupply()` across both passes,
after dropping the four whose supply is an 18-decimal number (vote-escrow contracts that also claim
the ERC-721 interface):

| `totalSupply()` | Address | Symbol | Name |
|---|---|---|---|
| 753,595 | `0x73991a25c818bf1f1128deaab1492d45638de0d3` | UNI-V3-POS | Uniswap V3 Positions NFT-V1 |
| 133,705 | `0xc1f54e15c17ba415702e7d0846ea23edb69a072c` | GM | GM |
| 100,000 | `0x4a2c6e28d1fbadee3c11c4b4157f4bf2fe2a1f1a` | HOWL | Howl Street |
| 39,981 | `0xa185814414aa3d39c9a0b73a373e00c8c04cb384` | FABL | Fablings |
| 38,051 | `0x07f44c47743a2f36414a82b9f558ecfcf0eedcef` | UP-POS | up Position NFT |
| 21,934 | `0x681b2731cdf07b0578746f0e7db1e217713f680e` | SANIMAL | Stock Market Animals |
| 21,000 | `0xb98da3e8600519d0436317819d0b9f95dc9a2b5c` | ROBS | Robscriptions |
| 16,893 | `0xc21df1bb620ebe7f5ae0144df50de28ce0d47ae7` | GM | GMCards |
| 13,442 | `0x6d33436b4f7200b9097285ac49e4092d877cb5a5` | LAND | Roblade |
| 12,602 | `0xb91691e6a727d3ff1164bc0856b65f9bc99b831a` | GIFT | Robinhood Gift |
| 11,840 | `0x51d0e5188afe12d502e29d982d20c190e7816107` | SUSHI-V3-POS | SushiSwap V3 Positions NFT-V1 |
| 11,111 | `0xb66c5aa645cdaa1ecbb317e976798253182c7f66` | XCOPUNKS | XCOPUNKS |
| 10,000 | `0xf08c65564eb07d880021105489552080b08e4319` | RPUNKS | **Robinhood Punks** |
| 10,000 | `0xd2d378c55a4976e2382db2f6e2ff7f64ef20e1ee` | RKONG | Robinhood Kong |
| 10,000 | `0x892d90abd9f4e0fa02b3d6f5674f37cddce1689a` | RobPunks | **RobPunks** — a second "punks" collection |
| 9,999 | `0xb2a4e06709afd31cf3f47d8f8a119c4208cc0c86` | RH | RoboHood |
| 9,990 | `0xe8dd21af6d23bb99d482f823d4ee44216fc34118` | RNCPS | Robinhood NPCs |

Two of those deserve a note. `UNI-V3-POS` and `UP-POS` and `SUSHI-V3-POS` are DEX liquidity-position
NFTs, not collectibles — they are ERC-721s and they are the largest on the chain by supply. And
`RobPunks` (10,000 supply) is a **different contract from Robinhood Punks with the same premise**:
NFT squatting is live here exactly as token squatting is, so an NFT collection can no more be
identified by its name than a token can be identified by its ticker.

### A.4 Price sources — there are none, for any of them

This is the answer that decides whether oracle-priced NFT lending is possible on this chain, so it is
proved six ways rather than asserted.

| Possible price source | Checked how | Result |
|---|---|---|
| **A Chainlink feed** | The registry was re-enumerated from scratch: every CREATE address from deployer `0xfE3c266C0F994f9552b70D9107214Fe0ED0d74d8` for nonces 0…940, `description()` called on each. **171 addresses answer, over 57 distinct descriptions.** The full list is in §B.4. | **Not one** references an NFT collection, a floor price, or anything that is not a stock, an ETF, a crypto asset or a stablecoin |
| **A Uniswap v3 pool** | `IUniswapV3Factory.getPool(collection, quote, fee)` on `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` — 3 collections × {USDG, WETH} × {100, 500, 3000, 10000} = **24 calls** | **All 24 returned the zero address** |
| **A Uniswap v4 pool** | Membership test against the full USDG-counterparty sets: 4,416 on v3, 57,924 on v4 (from `PoolManager.Initialize` at `0x8366a39CC670B4001A1121B8F6A443A643e40951`) | **None of the three appears in either set** |
| **An ERC-20 wrapper or floor token** | `symbol()` and `name()` read on all **61,363** distinct USDG counterparties across both Uniswap versions, matched against `punk`, `stonk`, `monkeyhood`, `nft`, `floor` | Only memecoins — `STONKBROKER`, `STONKS`, `PUNKY`, `Punk broker`, `FLOOR by Virtuals`, and so on. **No wrapper of any of the three collections** |
| **Longbow's own contracts** | `oracle()` called on both of their NFT loan contracts | **Reverts on both** — they publish no price |
| **Longbow's own frontend** | Their bundle carries `floorHint: 16`, `floorHint: 23500`, `floorHint: 50` as literals in `useNftActions-BxTFc56G.js` | A hard-coded constant, not a feed |

**An ERC-721 cannot be a Uniswap pool token in the first place**, so the second and third rows are
structural rather than incidental: `getPool` returning zero is what you would expect, and it is
recorded because "expected" is not the same as "checked".

The conclusion is clean and it is worth stating as plainly as it can be: **no NFT collection on
Robinhood Chain has any on-chain price source.** Not a feed, not a pool, not a floor oracle, not a
wrapper. Any NFT lending on this chain is peer-to-peer at hand-set terms with the token in escrow —
which is exactly what Longbow's own page says it is ("no oracle, no auto-liquidation") — and no
oracle-priced, auto-liquidating NFT market can be built here today.

### A.5 There *is* a marketplace, and it is Seaport

The absence of an oracle is not an absence of trading. Scanning `ApprovalForAll` filtered to each
collection's own address (cheap, and complete for that address) turns up real marketplace
infrastructure:

| Collection | `ApprovalForAll` events | Distinct operators | Dominant operator |
|---|---|---|---|
| Robinhood Punks | 3,456 | 15 | `0x963f00d3ff000064ffcba824b800c0000000c300` — 2,895 grants, 392 revokes |
| StonkBrokers | 1,579 | 4 | same conduit, 785 grants; then the staking contract `0xe302733a…`, 421 |
| MonkeyHood | 7,014 | 4 | same conduit, 6,060 grants |

`0x963f00d3ff000064ffcba824b800c0000000c300` is a **Seaport conduit**. It has emitted exactly two logs
in its life, both `ChannelUpdated(address indexed channel, bool open)`
(`0xae63067d43ac07563b7eb8db6595635fc77f1578a2a5ea06ba91b63e2afa37e2`), opening channels for
`0x0000000000000068f116a894984e2db1123eb395` and `0x0000000000c2d145a2526bd8c716263bfebe1a72` — the
canonical **Seaport 1.6** and **Seaport 1.5** addresses. `name()` on the first returns `"Seaport"`,
which is how it was confirmed rather than recognised.

So: **12,049 `ApprovalForAll` events** across the three collections (3,456 + 1,579 + 7,014), the
great majority of them grants to a Seaport conduit. Sale prices therefore exist, in Seaport's
`OrderFulfilled` logs. They are **history, not an oracle** — nothing on chain aggregates them into a
readable floor, and a lending contract cannot call a log. Those fills were **not** counted here: a
chain-wide scan of both Seaport addresses was attempted twice and abandoned both times (§F), and
nothing in this file depends on the number.

---

## B. RWA collateral that is not an equity

Three populations were searched, and each was enumerated rather than looked up by symbol.

1. **The 203 Robinhood beacon-proxy tokens.** Re-used from `docs/market-census.md` §1 — the complete
   set, derived by scanning `BeaconUpgraded(address indexed beacon)` for beacon
   `0xe10b6f6b275De231345C20d14aB812dB62151b00`. Every one of the 203 was re-read for `name()` and
   classified; every ETF, trust, fund and bond token among them is in §B.1 with a **live** pool
   measurement taken today.
2. **Everything paired with USDG on either Uniswap.** 4,416 counterparties on v3 and **57,924** on
   v4; `symbol()` and `name()` read on all of them (the v4 sweep was re-run today, 57,924/57,924).
   That is the population in which a non-Robinhood RWA token would have to live if it can be traded
   at all.
3. **The Chainlink feed registry.** Re-enumerated today: 171 answering addresses, **57 distinct
   descriptions**, complete list in §B.4. A feed is the strongest hint that an asset class is meant to
   exist on this chain, and following the non-equity feeds is how `syrupUSDG` was found.

### B.1 Non-equity RWA inside the Robinhood beacon set

Every token below is a verified beacon proxy (`eth_getStorageAt` slot
`0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50` = the beacon) and answers
`uiMultiplier()`. Pool figures are **live at head 55,211,999**: `getPool` at all four fee tiers
against USDG and WETH, then `USDG.balanceOf(pool)`, `slot0()` and `observe([1800,0])` on each hit.

| Asset class | Ticker | Token | `totalSupply()` | `uiMultiplier()` | Deepest USDG pool | USDG in it | card | Verdict |
|---|---|---|---|---|---|---|---|---|
| Treasury | **SGOV** | `0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5` | 21,883.81 | 1.005102 | `0xfab520051f96f4d2a32c22b6a3dd7fffdf231bfe` f3000 | **$1,257,860** | 1400 | already in the catalog — `tbills` 86%, `planned` |
| Treasury | **SHY** | `0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8` | 352.05 | 1.0 | `0x8517c791b522b6a4c20bd1021ff1f6a442dacba6` f10000 | **$0.00** | 1 | `BLOCKED-NO-EXIT` |
| Treasury | **WEEK** | `0xc93a8c440CEa26D7445dF01729f193b27965099f` | 5.95 | **2.006183** | — `getPool` zero at all 8 combos | — | — | `BLOCKED-NO-POOL` |
| Bond | **BND** | `0x2F62fC9fAbb470C690f141c28340eD832bB27020` | 0.00 | 1.0 | `0x4f7039ae91038a11e76da15f0ccc0ffc90e7c37b` f10000 | **$0.00** | 1 | `BLOCKED-NO-EXIT` |
| Bond/income | **JEPQ** | `0x565D3ff42D7d880287e5796B4c708632bE0cA098` | 0.00 | 1.0 | — `getPool` zero at all 8 combos | — | — | `BLOCKED-NO-POOL` |
| Commodity | **GLD** | `0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e` | 15,546.21 | 1.0 | `0x7a6a053eccf1446a2633e05aa6d40d09381997ec` f3000 | **$2,479,538** | 1400 | already planned (TWAP, `ETF`) |
| Commodity | **SLV** | `0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f` | 23,347.07 | 1.0 | `0x8cb787e6c315d464775289bad00fdd67d53ecb3d` f3000 | **$258,239** | 1801 | already listed (`ETF`) |
| Commodity | **USO** | `0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344` | 10,576.08 | 1.0 | `0x02175608f1b5e6b5ed221ccfdc7be197d111d915` f3000 | **$372,452** | 1801 | already listed (`ETF`) |
| Broad equity ETF | VTI | `0x0594134DF3f171a354D9C85eBD65b7A6148F6D09` | 43.89 | 1.0 | `0xb78dd1a97fa544c65d7d1f12453ecaaf1e05c36d` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` |
| Broad equity ETF | SCHD | `0xd63ABB2C13d7a8421a8017a712802053568e3C1D` | 1,841.69 | 1.0 | `0x359555e1fa3f28d5a25091dd9f6d350cb66566cf` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` |
| Broad equity ETF | SPMO | `0xAd622320e520de39e72d41EF07438C3Fd3354875` | 363.88 | 1.0 | `0x727c8a9e0da8bb21be322d2bb5d891b126143b8c` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` |
| Sector ETF | XLK | `0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43` | 317.86 | 1.0 | `0xe20463635ceeea8e30a315ffc4d4e81c80e53147` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` |
| Sector ETF | SMH | `0x072f979c2CAc8e1391B0162a87Fee094bF8744a0` | 141.11 | 1.0 | `0xf9d5f058099707f60740c09bf67b32967971dc63` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` |
| Sector ETF | SOXX | `0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38` | 405.86 | 1.0 | `0x563a3154bc09d2a2364b9a2a5766148f4e89be77` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` |
| Country ETF | INDA | `0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6` | 8,138.58 | 1.0 | `0x07c3a3a6eeb2f122493f32418fbf136403608cb8` f500 | **$68.67** | 1 | `BLOCKED-THIN` |
| Country ETF | EWT | `0x1c690498150252222C275A5CEd69d3A6b1f52D5E` | 292.68 | 1.0 | `0xe46891c34a895e988ff94ca79d20dcf1cfb02f64` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` |
| Country ETF | EWY | `0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc` | 3,862.69 | 1.0 | `0x23a254c637ef0f13f6259586f059fff52b89ed6b` f10000 | $0.00 | 1 | `BLOCKED-NO-EXIT` (has a Chainlink feed) |
| Thematic ETF | DRAM | `0x33C18e2CC8AE9AE486e785090D86B2CE632FF994` | 0.00 | 1.0 | — zero at all 8 combos | — | — | `BLOCKED-NO-POOL` |
| Thematic ETF | NASA | `0x6ddb95405db6179012Bff2fFf7E0F8d49cF00137` | 0.00 | 1.0 | — zero at all 8 combos | — | — | `BLOCKED-NO-POOL` |
| Closed-end fund | RVI | `0xb02e3E1b7f68559427C2D9100566E4F3CC5b7611` | 0.00 | 1.0 | — zero at all 8 combos | — | — | `BLOCKED-NO-POOL` |

**Nothing in that table is new and listable.** The four RWA tokens on this chain that have any
liquidity at all — SGOV, GLD, SLV, USO — are the four we already carry. The rest of the
non-equity book is deployed and empty: ten tokens whose USDG pool exists and holds exactly
**$0.00**, five with no pool at any fee tier against either quote, and INDA with **$68.67**.

Two footnotes that matter beyond this table:

* **WEEK's `uiMultiplier()` is 2.006183.** `docs/market-census.md` §7 already flags it; it is
  restated here because WEEK is a *Weekly T-Bill ETF* and would be the natural second name in the
  `tbills` tier if it were ever funded. One WEEK token is two shares, and a Chainlink feed would
  price one — that has to be composed into the oracle before the market exists, not after.
* **RVI is at `0xb02e3E1b7f68559427C2D9100566E4F3CC5b7611`, not `0xC1A0B4c0…`.** A token with
  `symbol()` = `RVI` and `name()` = `"Robinhood Ventures Fund"` sits at
  `0xC1A0B4c02f70e8c7a9398f2b3Ed13A8F6201E3A3` **with a funded USDG pool**, and it is **not in the
  beacon set** — its beacon slot is zero. The real RVI has no pool. This is the ticker-squatting
  failure mode from `market-census.md` §6 in its most dangerous form: the squatter is the one with
  liquidity.

### B.2 The one genuinely new RWA on this chain: `syrupUSDG`

Following the non-equity Chainlink feeds turned up a description no equity could explain —
**`syrupUSDG / USDG Exchange Rate`**. Chasing it produced the only new RWA token this census found.

| Fact | Value | Call that proved it |
|---|---|---|
| Address | **`0x40858070814a57FdF33a613ae84fE0a8b4a874f7`** | — |
| `symbol()` / `name()` | `syrupUSDG` / `syrupUSDG` | `eth_call 0x95d89b41`, `0x06fdde03` |
| `decimals()` | **6** | `eth_call 0x313ce567` |
| `totalSupply()` | **95,785,839.112394** | `eth_call 0x18160ddd` |
| Code size | 7,475 B | `eth_getCode` |
| Robinhood stock? | **No** — beacon slot is zero, `uiMultiplier()` reverts | `eth_getStorageAt` slot `0xa3f0ad74…`; `eth_call 0xa60bf13d` |
| ERC-4626 vault? | **No** — `asset()` and `convertToAssets()` both revert | `eth_call 0x38d52e0f`, `0x07a2d13a` |
| Symbol collisions | **Exactly one** token called `syrupUSDG` among all **61,363** distinct USDG counterparties on v3 and v4 | full `symbol()` sweep, both versions |
| Asset class | Private credit — a Maple/Syrup yield-bearing dollar | name, decimals and the Chainlink exchange-rate feed together |

**It has a working Chainlink price**, which is what makes it interesting rather than another
long-tail token:

| Feed | Phase-1 proxy | Phase-2 proxy | Aggregator | dec | answer | age |
|---|---|---|---|---|---|---|
| `syrupUSDG / USDG Exchange Rate` | `0xDd194C66aDcb422F188a04434e4824D70c151cF0` | `0x3bEdEA9CE3ead0Db4EA60dC497568DEdDe85dBa3` | `0xD972eB40C14C8aBA1c44c1DF6e0A6e1d592C1012` | 18 | **1.00948437** | 19.8 h |
| `USDG / USD` | `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | `0x901f56689360B89D7767a8acE28B7801e6348fa2` | `0x8bEeE3503F6860D5dac4cE26b5eEe92982951c2e` | 8 | **1.00007000** | 23.2 h |

Multiplied, that is $1.00955 per syrupUSDG. For context on what already exists rather than what
anyone should do about it: Morpho's `ChainlinkOracleV2` takes two base feeds and multiplies them
(`baseFeed1 × baseFeed2`), and `chainlinkOracleV2Factory` is live on this chain at
`0xB7c16F6F8cF531447Bf27Ca7220f981E79C9cdF2` — `eth_getCode` returns 4,464 bytes, matching what
`packages/config` records.

**And it has real depth — on Uniswap v4, which is the problem.**

| | |
|---|---|
| Uniswap **v3** pools vs USDG | **none** — `getPool` returns zero at fees 100/500/3000/10000 |
| Uniswap v3 pool vs WETH | one, `0x702c3CE15d27acF8E37e00900069BBBFFF699C7a` (fee 100), holding **0.187 syrupUSDG and 2.57e-8 WETH** — dust |
| Uniswap **v4** pool | poolId `0xeda151c73fd1d6c93c1c53e86f1104f1e0edc1f758dcf549903b9e8470e19ae2`, fee **800** (0.08%), tickSpacing 5, **no hooks** |
| v4 pool state (live) | `sqrtPriceX96 = 79553635544101385962622793996`, tick **81**, `liquidity = 438,664,926,254` |
| v4 spot | **1.008233 USDG per syrupUSDG** |
| Implied in-range reserves | **$440,467 USDG** and 436,870 syrupUSDG (`L·√P` and `L/√P`) |
| Upper bound on the whole v4 float | PoolManager holds **1,296,182 syrupUSDG** and $54,405,280 USDG |

The v4 spot (1.008233) and the Chainlink exchange rate (1.009484) agree to **0.12%** — two
independent sources, which is the cross-check `market-census.md` §1 asks for and one that no other
new candidate in this file can offer.

**Verdict: `BLOCKED-V4-ONLY-EXIT`.** Not blocked on price — blocked on the exit. Our
`flashLiquidator` (`0xC3374D9fB0CC9a85440f26EE461aF6Bfb6c6e7cE`) sells through Uniswap v3
`SwapRouter02` at `0xCaf681a66D020601342297493863E78C959E5cb2`, and there is no v3 pool to sell
syrupUSDG into. This is a different block from the ones in `market-census.md`: WSNET is v4-only *and*
unpriceable, whereas syrupUSDG is fully priced and merely unsellable by the liquidator we have. It
clears the moment either somebody seeds a v3 USDG pool or the liquidator learns to route through v4.

### B.3 Everything else that looked like RWA, and why it is not

Chased because the symbol matched, dismissed because the chain says so. Each was read with `symbol()`,
`name()`, `decimals()`, `totalSupply()`, the beacon slot, and `getPool` at all four fee tiers against
USDG and WETH.

| Symbol | Address | `name()` | `totalSupply()` | v3 pools | Verdict |
|---|---|---|---|---|---|
| XAUT | `0xec2b05d737d7fe4f00143d9ede7f1797bf541e18` | **"gold etf"** | 1,000,000,000 | none | squatter — no feed, no pool |
| XAUT | `0x57df9bea54f30cf80ccafda471eb4a47aeb78c58` | "Tether Gold" | 27,000 | none | no feed, no pool, nothing can price it |
| PAXG | `0xc700c81925d1d1c10f996fa7c0dee83a54c4bb8d` | "Paxos Gold" | **0.4882** | none | ERC-1967 beacon slot = `0x883d9f54f50c9d096b6b3823532fdc8fd8dfa293` — **not** the Robinhood stock beacon; empty |
| USDY | `0xffec69873bd0dbb8630c9379b2c50c4fd97316a7` | "USDY" | 1,000,000,000 | none | squatter |
| TBILL | `0x00f0b7b5111ee8fa10f803d5f489842066d46ed6` | "T-BILL" | 1e15, **9 decimals** | one USDG f10000 pool `0x7f148c0a…` holding **$0.000003** | memecoin |
| SYRUP | `0x37a83c76a670a46cd3700a15132b530ad9c78ba3` | "Syrup Finance" | 100,000,000,000 | none | squatter — **not** the syrupUSDG above |
| RVI | `0xC1A0B4c02f70e8c7a9398f2b3Ed13A8F6201E3A3` | "Robinhood Ventures Fund" | 99,999,999.99999999997 (18 dec) | funded USDG pool | beacon slot zero — squatter; the real RVI is `0xb02e3E1b…` and is empty |
| HOODon | `0xfB5b5778d45AE47F15323fb59B666c655174A79C` | "Robinhood Markets (Ondo Tokenized)" | 3,563.985 (18 dec) | funded USDG pool | beacon slot = `0x883d9f54f50c9d096b6b3823532fdc8fd8dfa293`, the **same** non-Robinhood beacon as the PAXG above — squatter |

Two bridged crypto assets do exist and are real, but they are crypto and not RWA, so they are noted
and not proposed: **cbBTC** `0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4` (8 dec, supply 20.0182, five
v3 pools, `CBBTC / USD` feed) and **USDe** `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` (18 dec,
supply 320,231,611, four v3 pools, `USDE / USD` feed).

### B.4 The complete Chainlink feed registry, and what it implies

171 addresses answer `description()`, over **57 distinct descriptions**. The 35 that name a stock or
ETF are tabulated in `docs/market-census.md` §8 (whose table also carries `ETH / USD`). The **22 that do not** are the whole non-equity
surface of this chain's oracle infrastructure:

| Category | Descriptions |
|---|---|
| Crypto | `BTC / USD`, `BTC.B / USD`, `CBBTC / USD`, `ETH / USD`, `LBTC / USD`, `LINK / USD`, `WBTC / USD`, `WEETH / USD`, `WSTETH / USD`, `ENA / USD` |
| Crypto exchange rates | `WEETH / EETH Exchange Rate`, `WSTETH / STETH Exchange Rate` |
| Stablecoins | `USDC / USD`, `USDT / USD`, `USDG / USD`, `USDE / USD`, `USDS / USD` |
| **FX** | **`EURC / USD`** |
| **Private credit** | **`SYRUPUSDC / USD`**, **`SYRUPUSDC / USDC Exchange Rate`**, **`SYRUPUSDT / USDT Exchange Rate`**, **`syrupUSDG / USDG Exchange Rate`** |

Three things fall out of that list.

**`EURC / USD` is the freshest feed on the chain and prices nothing.** `latestRoundData().updatedAt`
= **1788618937**, twenty-six minutes before the head block this file uses — while every other feed on
this chain, stock and crypto alike, is **12 to 36 hours** old, because 2026-09-05 is a Saturday.
Phase-1 proxy `0xfF2B10c1973eD10c841434f98e456d8f3a0D7DD8`, phase-2
`0x785b8C8831CEFb9F165548872aCa11425F33Cd95`, aggregator `0x7035B3E2FF9621A6f97aAFE5A5E3E5bbe718BADf`,
answer **1.16052558**. But **no token with `symbol()` = `EURC` exists** among the 61,363 distinct USDG
counterparties on v3 or v4, and DexScreener returns no EURC pair on this chain. A live euro price
with nothing on chain to apply it to. What that means is not on chain, and is not guessed at here.

**Four credit feeds, one token.** `SYRUPUSDC / USD` reads 1.18129723 (23.1 h),
`SYRUPUSDT / USDT Exchange Rate` reads 1.14175373 (19.7 h) — but neither `syrupUSDC` nor `syrupUSDT`
exists on this chain (`symbol()` sweep across both Uniswap versions, and DexScreener returns zero
pairs for both). Only `syrupUSDG` has both a feed and a token.

**No commodity feed exists that is not an equity ETF.** There is no `XAU / USD`, no `XAG / USD`, no
oil benchmark. GLD, SLV and USO are priced as *stocks* — GLD by TWAP only, since it has no feed at
all. Anyone promising commodity collateral on this chain is promising an ETF wrapper.

---

## C. What Longbow actually has

Only on-chain facts and their own published files. Their frontend bundle is a public artifact and is
quoted where it is the source; everything about state is a call.

### C.1 The collections are real

Verified in §A.2: three genuine ERC-721 contracts with 2,019, 636 and 1,572 holders, listed on a
Seaport marketplace, one of them (MonkeyHood) marked `hidden` in their own config and not rendered.
Their page's claim of first-mover status is not contradicted by anything here, and the collections
they name are not phantoms. Three corrections: the on-chain symbols are `RPUNKS`/`STONK` rather than
the `Punk`/`StonkBroker` their bundle shows; MonkeyHood's supply is 4,335, not the 4,586 it claims;
and half of StonkBrokers sits in one staking contract.

### C.2 The lending contracts

Both addresses come from their bundle (`useNftActions-BxTFc56G.js`), then everything below is a call.

| | Contract A | Contract B |
|---|---|---|
| Address | `0xE3535330a82867cD7b81C0d7e518f465D12dDd99` | `0xad08e3ce63A8aD55C903B7AF00054849A3e235c8` |
| Code size | 17,774 B | 19,873 B |
| `owner()` | `0x1bf704707e9F3f407EbC9364fDAeD08C39893770` | same |
| `adminFeeInBasisPoints()` | **500** | **500** |
| `oracle()` | reverts | reverts |
| Deployed (first log) | block 34,658,234 — **2026-08-12 16:05:01 UTC** | block 34,658,263 — same minute |
| Total logs ever emitted | **6** | **2** |
| Punks / StonkBrokers / MonkeyHood held now | **0 / 0 / 0** | **0 / 0 / 0** |
| USDG held now | **0** | **0** |

Contract B has emitted nothing since deployment but its `OwnershipTransferred` and one event
(`0xf100355be652ecc881568750e6a98c0713e4316f75d5314ebc9039e0acb52f24`) whose single indexed argument
is the USDG address and whose data is `1` — a currency whitelisting, by shape. **It has never been
used.**

### C.3 The entire loan history: two loans, $12 and $48

Contract A's six logs are its deployment pair plus two `LoanStarted`/`LoanRepaid` cycles. The event
layout is NFTfi's `DirectLoanFixedOffer` — which is not a guess: their own frontend builds exactly
that struct (`loanPrincipalAmount`, `maximumRepaymentAmount`, `nftCollateralId`,
`nftCollateralContract`, `loanDuration`, `loanAdminFeeInBasisPoints`, `loanERC20Denomination`,
`referrer`) before signing, and every field decodes consistently against it.

| | Loan #1 | Loan #2 |
|---|---|---|
| Started | block 34,845,210 — **2026-08-12 21:17:05 UTC** | block 46,545,177 — **2026-08-26 11:17:52 UTC** |
| Collateral | Robinhood Punks **#1860** | Robinhood Punks **#2754** |
| Principal | **12,000,000 USDG = $12.00** | **48,000,000 USDG = $48.00** |
| Maximum repayment | 12,009,863 = $12.009863 | 48,078,904 = $48.078904 |
| Stated duration | 1,296,000 s = **15 days** | 2,592,000 s = **30 days** |
| Borrower | `0x69c3eadc15cb2b505193d94e041299ca885a7da9` | `0x0cc7cedb0935ceab0b4a6b38ee7dcfd403b19a7b` |
| Lender | `0x1bf704707e9f3f407ebc9364fdaed08c39893770` — **the contract's own `owner()`** | `0x0cc7cedb0935ceab0b4a6b38ee7dcfd403b19a7b` — **the same address as the borrower** |
| Repaid | block 34,861,041 — 2026-08-12 21:43:30 — after **26 min 25 s** | block 49,309,561 — 2026-08-29 16:49:40 — after **3 d 5 h 32 m** |
| Paid to lender / admin fee | 12,009,370 / **493** | 48,074,959 / **3,945** |

Both were repaid in full at the maximum repayment amount. The admin fee is 5% of the interest, which
checks out on both (9,863 → 493; 78,904 → 3,945). **Total protocol revenue from NFT lending to date:
4,438 units of USDG — $0.004438.**

Nothing has happened on either contract since **2026-08-29**, seven days before this census. There
has never been a loan against a StonkBroker or a MonkeyHood; both loans were Punks, and both were
made by the operator or by a single address to itself.

Stated without inference: the collections are real and have thousands of holders; the lending product
built on them has two loans, $60 of cumulative principal, and holds nothing today.

### C.4 The RWA filter

Their live `/api/markets` returns **56 markets**. The filter labels come from their bundle:
`Stocks` = "Tokenized equities", **`RWA` = "Bridged real-world assets"**, `Crypto` = "Crypto
collateral", `Onchain-native` = "Memecoins and launchpad or protocol tokens" — though the API returns
that last category as `Memes`, so the bundle and the API disagree on its name.

| Their category | Count | Members |
|---|---|---|
| Stocks | 44 | the tokenised equities, **including SGOV** |
| **RWA** | **3** | **USO, SLV, GLD** — and nothing else |
| Crypto | 1 | ETH |
| Memes | 8 | AI, NOTHING, PONS, INDEX, STONKBROKER, CASHCAT_LEGACY, WSNET, WSNET-NN |

Their entire RWA category is three commodity ETFs from the same Robinhood beacon set we already read,
at the same three addresses we already have:

| Their RWA market | Collateral address | Their LLTV / oracle | Ours today |
|---|---|---|---|
| USO | `0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344` | 0.625, Chainlink | **listed**, `stock` 62.5%, Chainlink, category `ETF` |
| SLV | `0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f` | 0.625, Chainlink | **listed**, `stock` 62.5%, Chainlink, category `ETF` |
| GLD | `0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e` | 0.385, TWAP | **planned**, `longTail` 38.5%, TWAP, category `ETF` |

The addresses, the oracle choice and the LLTV all match what `packages/config` already carries. **We
already list every asset in their RWA category, and at the same risk parameters.** The difference is
the word on the tab: they call USO/SLV/GLD "RWA" and file SGOV — the only actual Treasury product on
the chain, and the one asset here with a genuine RWA claim — under "Stocks". We do the reverse.

Two other things their API shows that are worth recording because `docs/market-census.md` §6 left
them open:

* **WSNET is `0x63C12667638f2Ae6fC6ae09B43D98Ec84a8586eA`.** The previous census found that address by
  exhaustive symbol search and marked it *unconfirmed*. Their `/api/markets` names it as the
  collateral for both `WSNET` and `WSNET-NN`. The verdict does not change — no feed, v4 only — but the
  address is no longer a guess.
* **Their NOTHING market is `0x9B52d1C25c002BA6Ff5b68E8F9Ff4f2A27099e8f`**, not the
  `0x4672a663E2F65A5a7a5903Fa5045dB25e4B74663` the previous census found by symbol. Two different
  contracts both called NOTHING; a reminder that the symbol identifies nothing.

---

## D. What is listable today

The rule is the one `docs/market-census.md` §3 already applies, unchanged:

> `supplyCapUsd = floor_to_ladder( p × deepest USDG pool balance )`, ladder
> {250, 500, 1000, 2000, 5000, 10000, 25000}, hard ceiling **$25,000** at first listing,
> `BLOCKED-THIN` under $250. `p = 2%` Chainlink-priced, `p = 1%` TWAP-priced.
> LLTV: `eth` 77%, `tbills` 86% for a Chainlink-priced short-duration treasury ETF,
> `stock` 62.5% for a tokenised equity or ETF with a Chainlink feed **and** ≥ $50,000 of exit,
> `longTail` 38.5% for everything else.

### D.1 NFT markets

**Zero.** Not one NFT collection on this chain has a price source of any kind (§A.4), so there is
nothing to put a cap on. This is not a depth problem or a cardinality problem that a transaction
clears — there is no feed, no pool, no wrapper, and an ERC-721 cannot be a Uniswap pool token. Any
NFT lending here is peer-to-peer escrow at hand-set terms, which is a different product from
everything in `marketCatalog`.

### D.2 RWA markets

**Zero new.** The complete list of non-equity RWA tokens on this chain with any liquidity is SGOV,
GLD, SLV and USO, and `marketCatalog` already carries all four.

| Ticker | Asset class | Status in `packages/config` | Longbow's label |
|---|---|---|---|
| SGOV | Treasury bills | `planned`, `tbills` 86%, Chainlink, category `T-bills` | filed under **Stocks** |
| USO | Oil | `listed`, `stock` 62.5%, Chainlink, category `ETF` | **RWA** |
| SLV | Silver | `listed`, `stock` 62.5%, Chainlink, category `ETF` | **RWA** |
| GLD | Gold | `planned`, `longTail` 38.5%, TWAP, category `ETF` | **RWA** |

The only thing Longbow's RWA tab has that we do not is the word "RWA".

### D.3 The one candidate that is close, and exactly what stands in the way

| Ticker | Token | Oracle | Suggested tier | Depth used | Rule | Suggested cap | Blocker |
|---|---|---|---|---|---|---|---|
| **syrupUSDG** | `0x40858070814a57FdF33a613ae84fE0a8b4a874f7` | Chainlink composite: `syrupUSDG/USDG` `0xDd194C66aDcb422F188a04434e4824D70c151cF0` × `USDG/USD` `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | `longTail` **38.5%** | **$440,467** (v4 in-range `L·√P`) | 2% Chainlink | **$5,000** | **v4-only exit** |

The tier is what the rule produces mechanically: syrupUSDG is not a tokenised equity or ETF, so it
cannot take `stock` 62.5% however deep its pool, and it is not a treasury ETF, so `tbills` 86% is
wrong for it — private credit is not a T-bill, whatever the exchange rate looks like. `longTail`
38.5% is where "everything else that is listable" lands.

The block has exactly two components, and both are facts about venue rather than about the asset:

* There is **no Uniswap v3 USDG pool** for syrupUSDG — `getPool` is zero at all four fee tiers. The
  only market is v4 pool `0xeda151c7…` on PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`.
* `flashLiquidator` (`0xC3374D9fB0CC9a85440f26EE461aF6Bfb6c6e7cE`) sells through v3 `SwapRouter02`
  (`0xCaf681a66D020601342297493863E78C959E5cb2`) and has no v4 path. That is a property of our
  deployed code, read from `packages/config`, not a judgement about it.

For scale: the cap the rule would produce is $5,000 against a token with a **95,785,839** supply and
$1.3M of it sitting in the v4 singleton. Whichever way it is read, the constraint is the venue and
not the asset.

### D.4 Two blocks a single permissionless transaction would clear (unchanged from the last census)

Neither is new, both are still true, and both are cheaper than anything above:
`increaseObservationCardinalityNext` on STONKBROKER's fee-3000 pool (`0x8b1d1996f65178D9697224C570a09c51Caf79Bfc`,
$19,666, cardinality 1) and on INDEX's (`0xb89DE909AE9fDF14592c868Ad532c4cA3D100222`, $3,455,
cardinality 1). They appear here because Longbow's `/api/markets` reports both `INDEX` and
`STONKBROKER` as `live` with `oracleType: "twap"`, while `marketCatalog` carries INDEX as `blocked`
for exactly this reason and carries no STONKBROKER market at all.

---

## E. Exactly which calls proved what

| Claim | Call |
|---|---|
| This address is an ERC-721 | `supportsInterface(0x80ac58cd)` → `0x01ffc9a7` + the interface id, returns `true` |
| …and it is not an ERC-1155 | `supportsInterface(0xd9b67a26)` returns `false` |
| Collection metadata | `name()` `0x06fdde03`, `symbol()` `0x95d89b41`, `totalSupply()` `0x18160ddd`, `owner()` `0x8da5cb5b`, `tokenURI(1)` `0xc87b56dd`, batched through Multicall3 `aggregate3` at `0xcA11bde05977b3631167028862bE2a173976CA11` with `allowFailure = true` |
| **Exact holder count** | `ownerOf(id)` `0x6352211e` for every id in the collection's range — 10,001 calls for Punks, 4,445 for StonkBrokers, 26,001 for MonkeyHood — owners counted client-side. An empty `returnData` is a missing id, not a zero owner |
| ERC-1155 population (complete) | `eth_getLogs` topic0 `0xc3d58168…` (`TransferSingle`) and `0x4a39dc06…` (`TransferBatch`), block 0 → head, 1M-block chunks halving on failure |
| ERC-721 population (sampled) | `eth_getLogs` topic0 `0xddf252ad…` topic1 `0x0` over 220 windows of 2,000 blocks spaced evenly across the chain, plus an earlier 28-window pilot; kept only the logs with **four** topics |
| No Chainlink feed exists for X | CREATE addresses from deployer `0xfE3c266C0F994f9552b70D9107214Fe0ED0d74d8` nonces 0…940, `description()` `0x7284e416` on each — 171 answer, 57 distinct strings, and the list is exhaustive because it enumerates the deployer rather than searching |
| Feed liveness and value | `decimals()` `0x313ce567`, `latestRoundData()` `0xfeaf968c`, `phaseId()` `0x58303b10`, `aggregator()` `0x245a7bfc` |
| This pool exists, or does not | `IUniswapV3Factory.getPool(a,b,fee)` `0x1698ee82` on `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` at fees 100/500/3000/10000 against both USDG and WETH — a zero address is proof of absence |
| Pool depth and state | `USDG.balanceOf(pool)` `0x70a08231`, `token.balanceOf(pool)`, `slot0()` `0x3850c7bd`, `liquidity()` `0x1a686502`, `observe([1800,0])` `0x883bdbfd` |
| A Uniswap **v4** pool exists, and its state | `eth_getLogs` on PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951` topic0 `0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438` (`Initialize`) with the token in the currency0/currency1 topic; then `extsload(bytes32)` `0x1e2eaeaf` at `keccak256(abi.encode(poolId, uint256(6)))` for slot0 and `+3` for liquidity |
| This token is not a Robinhood stock | `eth_getStorageAt` slot `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50` returns zero, and `uiMultiplier()` `0xa60bf13d` reverts |
| This symbol is unique on the chain | `symbol()` read on all 4,416 v3 and all 57,924 v4 USDG counterparties — the v4 sweep completed 57,924/57,924 today |
| Which operators a collection has approved | `eth_getLogs` with `address` = the collection and topic0 `0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31` (`ApprovalForAll`), block 0 → head. Address-filtered, so complete for that collection |
| That operator is a Seaport conduit | its only two logs are `ChannelUpdated` `0xae63067d…` opening channels for `0x0000…eb395` and `0x0000…e1a72`; `name()` on the first returns `"Seaport"` |
| Longbow's loan history | `eth_getLogs` with `address` = each loan contract, block 0 → head — 6 logs and 2 logs respectively, decoded against the struct their own frontend builds |
| Longbow's contracts hold nothing | `collection.balanceOf(loanContract)` for all three collections and both contracts, and `USDG.balanceOf(loanContract)` |
| Block times for the loan timeline | `eth_getBlockByNumber` on each event's block, `timestamp` field |

Every batched `eth_call` went through Multicall3 `aggregate3` with `allowFailure = true`, and an empty
`returnData` was recorded as a failure rather than decoded as a zero — which is how
`BLOCKED-NO-EXIT` was told apart from "a pool holding nothing". It is also how MonkeyHood's sparse id
range was found: a first probe of ids 0…4,335 — the obvious range for a `totalSupply()` of 4,335 —
returned only **431** owners, which a decoder that read an empty `returnData` as the zero address
would have reported as 3,904 burned tokens. Widening the probe to 26,000 ids found the real range,
519…11,219, and the full 4,335.

---

## F. What could not be resolved, and what was tried

**A complete ERC-721 enumeration is not possible on this RPC.** Not "was not attempted" — was
attempted six ways and each one is refused by the node, with the exact error messages recorded in
§A.1. The 10,000-log cap binds at fewer than 5,000 blocks for an unfiltered `Transfer` scan, the
tokenId topic is not indexed so the precise ERC-721 filter times out, and `ApprovalForAll` times out
below 40,000-block windows in the dense regions. Two full-chain `ApprovalForAll` runs were started and
abandoned after reaching blocks 21.9M and 6.1M in 23 and 3 minutes respectively; the partial run
found 320 distinct collections in blocks 0–6.1M alone, which is consistent with the sample but is not
quoted as a result. What stands instead: **1,739 ERC-721 contracts proved by `supportsInterface`**
across the two sampling passes (1,592 of them from the uniform 0.656% sample alone), and a complete
ERC-1155 count of 1,411.

**Seaport fill counts and observed sale prices were not obtained.** A chain-wide `eth_getLogs` scan
of `OrderFulfilled` (`0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31`) on both
Seaport addresses, filtering the data for the three collection addresses, was started twice and
abandoned both times without returning — the same node behaviour that defeats the ERC-721
enumeration. §A.5's claim is about `ApprovalForAll` and `ChannelUpdated`, both of which are
address-filtered and did complete; no number in this file rests on a fill count.

**Holder counts were computed only for the three collections Longbow names.** An exact count costs one
`ownerOf` per token id; doing it for 1,592 collections is roughly 10 million calls and was not
attempted. For the wider population this file reports `totalSupply()` and nothing it did not measure.

**`EURC` has a live feed and no findable token.** `symbol()` was read on all 61,363 distinct USDG
counterparties across Uniswap v3 and v4 and **not one** returns `EURC`; DexScreener returns zero pairs
for EURC on this chain. If an EURC token exists here it has never been paired with USDG on either
Uniswap, which for the purposes of this census is the same as not existing — there would be nothing to
liquidate into. Same for `syrupUSDC` and `syrupUSDT`, both of which have feeds.

**`syrupUSDG`'s identity rests on three facts, not on a registry.** No on-chain registry links the
Chainlink feed to the token address, and this chain has no beacon for non-Robinhood tokens the way it
does for stocks. What is known: the symbol is **unique** across all 61,363 distinct USDG counterparties on both
Uniswap versions; the chain's own Chainlink deployer shipped a feed whose `description()` is
`syrupUSDG / USDG Exchange Rate`; and that feed's answer (1.009484) agrees with the v4 pool's spot
(1.008233) to 0.12%. That is a stronger basis than the one PONS and CASHCAT are listed on
(`market-census.md` §6: "exactly one candidate per symbol holds any money"), and it is stated as the
basis rather than hidden.

**The syrupUSDG v4 depth is a derived number, not a balance.** Uniswap v4 is a singleton: the
PoolManager holds 1,296,182 syrupUSDG and $54,405,280 USDG across *every* v4 pool, so
`balanceOf(pool)` — the measure `market-census.md` uses everywhere — does not exist for a v4 pool. The
$440,467 in §D.3 is `L·√P` from the pool's live `liquidity` and `sqrtPriceX96`, which is the
v2-equivalent in-range depth. It is smaller than the PoolManager's syrupUSDG balance, which is the
conservative direction, but it is not the same kind of number as every other depth in these two files
and should not be compared to them without that caveat.

**Two Longbow addresses in `market-census.md` §6 are now settled and one is corrected.** WSNET is
`0x63C12667638f2Ae6fC6ae09B43D98Ec84a8586eA` (`symbol()` = `wsNET`, `name()` = `Wrapped Staked NET`,
supply now 1,199.31, up from 1,170.49 at the last reading) — confirmed by their own `/api/markets`,
no longer a guess. Their NOTHING market is `0x9B52d1C25c002BA6Ff5b68E8F9Ff4f2A27099e8f`
(`symbol()` = `NOTHING`, `name()` = `Nothing`, supply 251,092.26), **not** the
`0x4672a663E2F65A5a7a5903Fa5045dB25e4B74663` that a symbol search returned last time. Neither changes
a verdict; both change an address, which is the point.

**Depths move.** `USDG.balanceOf(pool)` drifts a few percent an hour with trading. GLD read $2,561,710
in the last census and $2,479,538 today; SGOV read $1,190,186 and $1,257,860. The cap ladder is coarse
enough that no number in §D changes.
