import { defineChain } from "viem";

/** Robinhood Chain mainnet (Arbitrum Orbit). Public RPC is rate-limited and pruned; use Alchemy in prod. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

export const CHAIN_ID = 4663 as const;

export const tokens = {
  USDG: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6, symbol: "USDG" },
  WETH: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", decimals: 18, symbol: "WETH" },
} as const;

/** Tokenized stocks: ERC-20, 18 decimals, ERC-8056 uiMultiplier. */
export const stocks = {
  NVDA: {
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    feedAggregator: "0xC9d16E4f2569b9E3ea0468fD85844953713DC2a2",
    usdgPool: { address: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3", fee: 500 },
    name: "NVIDIA",
    exchange: "Nasdaq",
  },
  TSLA: {
    address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    feed: "0x4A1166a659A55625345e9515b32adECea5547C38",
    feedAggregator: "0x7A6b81ba7FbCB90104d8C496158Cf383cD7233b1",
    usdgPool: { address: "0xf4ACdAEEB7022862A763C9B1B885e11191c889E3", fee: 3000 },
    name: "Tesla",
    exchange: "Nasdaq",
  },
  SPY: {
    address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    feed: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
    feedAggregator: "0x78BCB218fA04B9b3a278eBc865Ed320BF8DEFBAc",
    usdgPool: { address: "0xa7Bb1AC63BBaB0C44316E6c8C455213441689167", fee: 500 },
    name: "SPDR S&P 500 ETF",
    exchange: "NYSE Arca",
  },
  AAPL: {
    address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
    feedAggregator: "0xBb11A21267cFDb63d4935d99a499133DD1744ACb",
    usdgPool: { address: "0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D", fee: 500 },
    name: "Apple",
    exchange: "Nasdaq",
  },
  HIMS: {
    address: "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0xC8C90d3a1c1a24967E773ac2aD0d456BA3E31F64", fee: 3000 },
    name: "Hims & Hers Health",
    exchange: "NYSE",
  },
  MSFT: {
    address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
    feed: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E",
    feedAggregator: undefined,
    usdgPool: { address: "0xeb60bcd1d920ad6e102690ccfc6fb488899e1510", fee: 3000, cardinality: 1801 },
    name: "Microsoft",
    exchange: "Nasdaq",
  },
  QQQ: {
    address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68",
    feed: "0x80901d846d5D7B030F26B480776EE3b29374C2ae",
    feedAggregator: undefined,
    // The deeper fee-500 pool only carries cardinality 300; the 3000 pool is the safer TWAP source.
    usdgPool: { address: "0xd60a5d14db690b7afad71f76b108071d7175597d", fee: 500, cardinality: 300 },
    name: "Invesco QQQ Trust",
    exchange: "Nasdaq",
  },
  GOOGL: {
    address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
    feed: "0xF6f373a037c30F0e5010d854385cA89185AE638b",
    feedAggregator: undefined,
    usdgPool: { address: "0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7", fee: 500, cardinality: 1801 },
    name: "Alphabet",
    exchange: "Nasdaq",
  },
  AMZN: {
    address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    feed: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C",
    feedAggregator: undefined,
    usdgPool: { address: "0x8ac92da74ab5f3b1d024dc1943ad7e15dc4179ef", fee: 3000, cardinality: 1801 },
    name: "Amazon",
    exchange: "Nasdaq",
  },
  META: {
    address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
    feed: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1",
    feedAggregator: undefined,
    usdgPool: { address: "0x107a7cb40d8665360ba10e59471af06150a50922", fee: 3000, cardinality: 1400 },
    name: "Meta Platforms",
    exchange: "Nasdaq",
  },
  SGOV: {
    address: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5",
    feed: "0xa0DF4ee0fFf975306345875E3548Fcc519577A11",
    feedAggregator: undefined,
    usdgPool: { address: "0xfab520051f96f4d2a32c22b6a3dd7fffdf231bfe", fee: 3000, cardinality: 1400 },
    name: "iShares 0-3 Month Treasury Bond ETF",
    exchange: "NYSE Arca",
    /**
     * The only token whose uiMultiplier is not 1: 1.005101770003214918, already effective.
     * Any oracle for SGOV has to carry it, or the collateral is undervalued by half a percent.
     */
    uiMultiplier: 1_005_101_770_003_214_918n,
  },
  SPCX: {
    address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
    feed: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb",
    feedAggregator: undefined,
    usdgPool: { address: "0xc61284332117c3fb23a2a56cceffd07f7af60029", fee: 500, cardinality: 3100 },
    name: "SpaceX (pre-IPO)",
    exchange: "Private",
  },
} as const;

/**
 * Chain-native tokens: memecoins and an index, not tokenized equities. No Chainlink feed exists for
 * any of them (checked against the full 56-feed registry, not a failed lookup), so a market on one
 * has to be priced by TWAP.
 */
export const nativeTokens = {
  PONS: {
    address: "0x39dBED3a2bd333467115dE45665cC57F813C4571",
    usdgPool: { address: "0x7a192e71564ec66ee0763e328a3ac274942de4e1", fee: 10000, cardinality: 300 },
    name: "Pons",
  },
  CASHCAT: {
    address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
    usdgPool: { address: "0x4b0c312ffbb068f6a0bea128759e35d94b94d0e1", fee: 10000, cardinality: 360 },
    name: "Cashcat",
  },
  INDEX: {
    address: "0x56910D4409F3a0C78C64DD8D0545FF0705389870",
    // On-chain symbol is "Index", and the only pool has observationCardinality 1 — no TWAP is
    // possible until increaseObservationCardinalityNext has been called and the window has filled.
    usdgPool: { address: "0xb89de909ae9fdf14592c868ad532c4ca3d100222", fee: 10000, cardinality: 1 },
    name: "Index",
  },
} as const;

/**
 * How to tell a real tokenized stock from the ticker-squatting memecoins that share its symbol.
 * Blockscout returns 30+ hits for a ticker like SPCX; symbol alone proves nothing.
 * Verified 2026-09-04: the real tokens answer `uiMultiplier()`, the impostors revert on it.
 */
export const stockTokenIdentity = {
  deployer: "0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046",
  implementation: "Stock",
  /** Selector that must not revert: uiMultiplier(). */
  marker: "0xa60bf13d",
  knownImpostors: [
    "0xd6a1232c3403dCaaE4f65Dc76Ee3C40528A51D2B", // fake SPCX, a CurvePumpToken
  ],
} as const;

/**
 * Every Chainlink description on this chain resolves through TWO proxies to the same aggregator,
 * returning identical answers but different round ids (phase 1 vs phase 2). Pin the one recorded in
 * `stocks[…].feed` and never pattern-match the description: naming runs across three schemes
 * ("RHMSFT / USD", "Robinhood GOOGL / USD", "Robinhood SGOV-USD").
 */
export const feedRegistry = {
  deployer: "0xfE3c266C0F994f9552b70D9107214Fe0ED0d74d8",
  proxyCount: 113,
  distinctFeeds: 56,
} as const;

export type StockSymbol = keyof typeof stocks;

export const external = {
  uniswapV3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  uniswapV3SwapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2",
  uniswapV4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  ethUsdFeed: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
  morphoBlue: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010",
  robinhoodApi: "https://api.robinhood.com/rhj",
} as const;

/**
 * Morpho Blue stack on Robinhood Chain (4663).
 * `verified` = `eth_getCode` returned bytecode on the public RPC (checked 2026-09-04).
 * The vault factory, Bundler3, PreLiquidationFactory and PublicAllocator are NOT deployed at their
 * Ethereum/Base addresses here — probed and empty — so those come from our own deploy of the
 * Morpho sources (PLAN §2.1).
 */
export const morpho = {
  blue: { address: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010", verified: true, codeSize: 15582 },
  adaptiveCurveIrm: { address: "0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1", verified: true, codeSize: 2282 },
  chainlinkOracleV2Factory: { address: "0xB7c16F6F8cF531447Bf27Ca7220f981E79C9cdF2", verified: true, codeSize: 4464 },
  /** Not deployed by Morpho on this chain, so we deployed their factory ourselves, unmodified. */
  metaMorphoFactory: { address: "0xD371727A6F3c5033204b6E4D5548EF4Ad40C9E20", verified: true },
  vaultV2Factory: { address: null, verified: false },
  bundler3: { address: null, verified: false },
  preLiquidationFactory: { address: null, verified: false },
  publicAllocator: { address: null, verified: false },
} as const;

/**
 * Liquidation LTV tiers (PLAN §3.3 and §1A.2), fixed before a market is created and immutable after.
 *
 * Morpho Blue only accepts an LLTV that governance has enabled, and this deployment enables exactly
 * 0, 38.5%, 62.5%, 77%, 86%, 91.5%, 94.5%, 96.5% and 98% — verified with `isLltvEnabled` on
 * 2026-09-04. The plan's 70% tier for TWAP-backed megacaps and its 66.7% short tier are therefore
 * not available: `createMarket` reverts with "LLTV not enabled". Both are pinned to the nearest
 * enabled value BELOW the intended one, which is the conservative direction — a lower LLTV liquidates
 * earlier and lends less, so nothing is exposed by the substitution.
 */
export const ENABLED_LLTVS = [
  0n,
  385_000_000_000_000_000n,
  625_000_000_000_000_000n,
  770_000_000_000_000_000n,
  860_000_000_000_000_000n,
  915_000_000_000_000_000n,
  945_000_000_000_000_000n,
  965_000_000_000_000_000n,
  980_000_000_000_000_000n,
] as const;

export const LLTV = {
  tbills: 860_000_000_000_000_000n,
  eth: 770_000_000_000_000_000n,
  /** Intended 70% (PLAN §1A.2); not enabled on chain, so it sits with the plain stock tier. */
  megacapTwap: 625_000_000_000_000_000n,
  /** Intended 66.7% — 150% coverage; not enabled, so shorts run at 160% coverage instead. */
  short: 625_000_000_000_000_000n,
  stock: 625_000_000_000_000_000n,
  longTail: 385_000_000_000_000_000n,
} as const;

export type MarketTier = keyof typeof LLTV;
export type MarketSide = "long" | "short";
/** How the collateral is priced. `chainlinkTwapMin` takes min(feed, twap): conservative for collateral. */
export type OracleKind = "chainlink" | "chainlinkTwapMin" | "twap" | "inverse";
export type MarketCategory = "Stocks" | "ETF" | "T-bills" | "Crypto" | "Pre-IPO" | "Onchain-native";
/** `listed` once createMarket has run; everything else is a market we have specified but not created. */
export type ListingStatus = "listed" | "planned" | "blocked";

export type MarketDef = {
  key: string;
  side: MarketSide;
  /** What the borrower posts. */
  collateral: string;
  /** What the borrower takes out. */
  loan: string;
  tier: MarketTier;
  oracle: OracleKind;
  category: MarketCategory;
  /** Supply cap in USD at listing. Raised only against measured exit depth (PLAN §3.2). */
  supplyCapUsd: number;
  status: ListingStatus;
  /** Why a market is blocked, when it is. */
  note?: string;
};

/**
 * The market catalog (PLAN §3.3). A ticker only becomes `planned` once its token address and its
 * price source are both known — an unverified address is worse than a gap, so the rest stay
 * `blocked` with the reason stated, and the site says so rather than quietly dropping them.
 */
export const marketCatalog: MarketDef[] = [
  // Long: borrow USDG against stock, ETF and crypto collateral.
  { key: "NVDA", side: "long", collateral: "NVDA", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "planned" },
  { key: "SPY", side: "long", collateral: "SPY", loan: "USDG", tier: "stock", oracle: "chainlink", category: "ETF", supplyCapUsd: 2000, status: "planned" },
  { key: "AAPL", side: "long", collateral: "AAPL", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "planned" },
  { key: "TSLA", side: "long", collateral: "TSLA", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 1000, status: "planned" },
  { key: "ETH", side: "long", collateral: "WETH", loan: "USDG", tier: "eth", oracle: "chainlink", category: "Crypto", supplyCapUsd: 5000, status: "planned" },
  { key: "HIMS", side: "long", collateral: "HIMS", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 500, status: "planned", note: "No Chainlink feed on this chain; priced by a 30–60 min v3 TWAP once cardinality is raised." },
  { key: "SPCX", side: "long", collateral: "SPCX", loan: "USDG", tier: "longTail", oracle: "chainlink", category: "Pre-IPO", supplyCapUsd: 2000, status: "planned", note: "Pre-IPO: a Chainlink feed exists, but the exit is one pool — the long-tail LLTV stands." },
  { key: "PONS", side: "long", collateral: "PONS", loan: "USDG", tier: "longTail", oracle: "twap", category: "Onchain-native", supplyCapUsd: 5000, status: "planned", note: "No feed on this chain; priced by a 10000-fee pool TWAP." },
  { key: "CASHCAT", side: "long", collateral: "CASHCAT", loan: "USDG", tier: "longTail", oracle: "twap", category: "Onchain-native", supplyCapUsd: 1000, status: "planned", note: "No feed; thin pool, so the cap starts low." },
  { key: "INDEX", side: "long", collateral: "INDEX", loan: "USDG", tier: "longTail", oracle: "twap", category: "Onchain-native", supplyCapUsd: 500, status: "blocked", note: "Its only pool has observationCardinality 1 — no TWAP until increaseObservationCardinalityNext is called and the window fills." },
  { key: "MSFT", side: "long", collateral: "MSFT", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "planned" },
  { key: "GOOGL", side: "long", collateral: "GOOGL", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "planned" },
  { key: "AMZN", side: "long", collateral: "AMZN", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "planned" },
  { key: "META", side: "long", collateral: "META", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 1000, status: "planned" },
  { key: "QQQ", side: "long", collateral: "QQQ", loan: "USDG", tier: "stock", oracle: "chainlink", category: "ETF", supplyCapUsd: 2000, status: "planned" },
  { key: "SGOV", side: "long", collateral: "SGOV", loan: "USDG", tier: "tbills", oracle: "chainlink", category: "T-bills", supplyCapUsd: 2000, status: "planned" },

  // Short: post USDG, borrow the stock itself and sell it (PLAN §1A.1). Priced by an inverse oracle.
  { key: "NVDA-SHORT", side: "short", collateral: "USDG", loan: "NVDA", tier: "short", oracle: "inverse", category: "Stocks", supplyCapUsd: 1000, status: "planned" },
  { key: "TSLA-SHORT", side: "short", collateral: "USDG", loan: "TSLA", tier: "short", oracle: "inverse", category: "Stocks", supplyCapUsd: 1000, status: "planned" },
];

/** UI never opens a position at the very edge of LLTV (PLAN §1.2, §3.3), in percentage points. */
export const SAFE_CAP_MARGIN: Record<MarketTier, number> = {
  tbills: 4,
  eth: 5,
  megacapTwap: 5,
  short: 6,
  stock: 5,
  longTail: 8,
};

/** How long a price may stand still before it stops being a normal market pause, in seconds. */
export const FEED_MAX_AGE = {
  /** Stock feeds are 24/5 and hold their last print across a ~65 h weekend (docs/chain-facts.md). */
  stock: 5 * 24 * 60 * 60,
  crypto: 24 * 60 * 60,
} as const;

export type VaultKind = "core" | "frontier" | "eth" | "stockLending" | "partner";

export type VaultDef = {
  key: string;
  kind: VaultKind;
  name: string;
  symbol: string;
  /** The asset a depositor supplies. */
  asset: string;
  /** Markets this vault is allowed to lend into, by catalog key. */
  markets: string[];
  description: string;
  status: ListingStatus;
};

/** Earn side (PLAN §1.1 and §1A.1). Partner vaults are created per request, seeded by the partner. */
export const vaultCatalog: VaultDef[] = [
  {
    key: "core-usdg",
    kind: "core",
    name: "Cluby Core USDG",
    symbol: "cUSDG",
    asset: "USDG",
    markets: ["NVDA", "SPY", "AAPL", "TSLA", "ETH"],
    description: "Chainlink-priced collateral only. The conservative book: megacaps, an index ETF and ETH.",
    status: "planned",
  },
  {
    key: "frontier-usdg",
    kind: "frontier",
    name: "Cluby Frontier USDG",
    symbol: "fUSDG",
    asset: "USDG",
    markets: ["HIMS"],
    description: "Long-tail collateral priced by TWAP. Higher rate, thinner exit, smaller caps.",
    status: "planned",
  },
  {
    key: "core-weth",
    kind: "eth",
    name: "Cluby ETH",
    symbol: "cWETH",
    asset: "WETH",
    markets: [],
    description: "Lend WETH against stock collateral. Opens once the USDG book has depth.",
    status: "planned",
  },
  {
    key: "lend-nvda",
    kind: "stockLending",
    name: "Cluby NVDA Lending",
    symbol: "lNVDA",
    asset: "NVDA",
    markets: ["NVDA-SHORT"],
    description: "Lend your NVDA to short sellers and earn the borrow rate while keeping the exposure.",
    status: "planned",
  },
];

/**
 * Money flows (PLAN §3.1). Performance fee is 0 for the first 90 days after a vault opens (§1A.4),
 * then the curve fee applies; the split below is of the fee, not of user principal.
 */
export const economics = {
  performanceFeeWad: 100_000_000_000_000_000n, // 10%
  introFeeWad: 0n,
  introDays: 90,
  /** Of the fee taken: to stakers, to treasury. */
  feeSplit: { stakers: 0.75, treasury: 0.25 },
  /** Share of interest a borrower gets back through the weekly Merkle epoch. */
  borrowRebate: 0.1,
  /** Share of the performance fee attributed to a builder's referred volume. */
  builderShare: 0.5,
  /** Creator fee on protocol-token trading routed to stakers. */
  tokenCreatorFeeToStakers: 0.05,
  flashLoanFee: 0,
} as const;

/** Pre-liquidation parameters (PLAN §1A.3): soft, partial unwind before the hard LIF applies. */
export const preLiquidation = {
  /** preLltv = LLTV − 5 pp. */
  lltvOffsetPp: 5,
  closeFactor: { start: 0.2, end: 1.0 },
  incentiveFactor: { start: 1.02, end: 1.04 },
} as const;

/**
 * Deployed on Robinhood Chain mainnet, 2026-09-04. The canary: three markets, two contracts of ours,
 * ownership still on the deploy key until a Safe exists.
 */
export const deployments: {
  lens?: `0x${string}`;
  flashLiquidator?: `0x${string}`;
  leverageRouter?: `0x${string}`;
  stakingRewards?: `0x${string}`;
  merkleDistributor?: `0x${string}`;
  creditRegistry?: `0x${string}`;
  metaMorphoFactory?: `0x${string}`;
  owner?: `0x${string}`;
  startBlock?: number;
  vaults: Record<string, `0x${string}`>;
  oracles: Record<string, `0x${string}`>;
  markets: Record<string, { id: `0x${string}`; oracle: `0x${string}` }>;
} = {
  lens: "0x5fC2Cd44d8caA4b3A6e330849bEbc3cA323c625b",
  /**
   * Second deploy: the first (0xDCc269c0…) collapsed the flash-loan size and the swap floor into
   * one number, which holds only while the debt stays under the floor. Abandoned, not upgraded —
   * it holds nothing, so replacing it costs a deploy and nothing else.
   */
  flashLiquidator: "0x91B3c5b8C76386A8293B1CE97fE8dceB10733F5B",
  leverageRouter: "0xBF6cdE3F772cB3939dFCc313AA4E83C3452bab6B",
  owner: "0x9C5C4b4A985b0A60a1067a0d82020774661d074A",
  /** Block of the first Cluby deploy — where the indexer starts. */
  startBlock: 54451901,
  metaMorphoFactory: "0xD371727A6F3c5033204b6E4D5548EF4Ad40C9E20",
  vaults: {
    "core-usdg": "0x97e813828B0250dCa5c05FF2567dfD616E5b3C61",
  },
  oracles: {
    NVDA: "0xB5736a58CE6370DaD1888d8996cf64A22e622BB8",
    SPY: "0x1bb6b9792e9852CB7bfEB14A5951394D07817b7D",
    ETH: "0x3b43937193b444DDa2251a9A58442cDD5e90f7fD",
  },
  markets: {
    NVDA: {
      id: "0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826",
      oracle: "0xB5736a58CE6370DaD1888d8996cf64A22e622BB8",
    },
    SPY: {
      id: "0xf95832e36d9d8baf35eb78ce80cbed92d20198ba639659b3f9a2ab00ced0a0c1",
      oracle: "0x1bb6b9792e9852CB7bfEB14A5951394D07817b7D",
    },
    ETH: {
      id: "0x6722f53f25a8d6e73493893c4f7f80ddc535cf97c4a93116fd55296e714216ae",
      oracle: "0x3b43937193b444DDa2251a9A58442cDD5e90f7fD",
    },
  },
};

export const BPS = 10_000n;
export const ORACLE_PRICE_SCALE = 10n ** 36n;
export const WAD = 10n ** 18n;
