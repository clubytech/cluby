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
  metaMorphoFactory: { address: null, verified: false },
  vaultV2Factory: { address: null, verified: false },
  bundler3: { address: null, verified: false },
  preLiquidationFactory: { address: null, verified: false },
  publicAllocator: { address: null, verified: false },
} as const;

/**
 * Liquidation LTV tiers (PLAN §3.3 and §1A.2). Fixed before a market is created and immutable after.
 * `megacapTwap` is the 70% tier a megacap earns once a v3 pool backs a min(feed, twap) oracle;
 * `short` is the 66.7% that corresponds to 150% coverage on a stock-borrow market.
 */
export const LLTV = {
  tbills: 860_000_000_000_000_000n,
  eth: 770_000_000_000_000_000n,
  megacapTwap: 700_000_000_000_000_000n,
  short: 667_000_000_000_000_000n,
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
  { key: "MSFT", side: "long", collateral: "MSFT", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "blocked", note: "Token and feed addresses on 4663 not confirmed yet." },
  { key: "GOOGL", side: "long", collateral: "GOOGL", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "blocked", note: "Token and feed addresses on 4663 not confirmed yet." },
  { key: "AMZN", side: "long", collateral: "AMZN", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "blocked", note: "Token and feed addresses on 4663 not confirmed yet." },
  { key: "META", side: "long", collateral: "META", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 1000, status: "blocked", note: "Token and feed addresses on 4663 not confirmed yet." },
  { key: "QQQ", side: "long", collateral: "QQQ", loan: "USDG", tier: "stock", oracle: "chainlink", category: "ETF", supplyCapUsd: 2000, status: "blocked", note: "Token and feed addresses on 4663 not confirmed yet." },
  { key: "SGOV", side: "long", collateral: "SGOV", loan: "USDG", tier: "tbills", oracle: "chainlink", category: "T-bills", supplyCapUsd: 2000, status: "blocked", note: "Token and feed addresses on 4663 not confirmed yet." },

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

/** Filled by the deploy scripts (contracts/broadcast). Empty until the first deploy. */
export const deployments: {
  lens?: `0x${string}`;
  flashLiquidator?: `0x${string}`;
  leverageRouter?: `0x${string}`;
  stakingRewards?: `0x${string}`;
  merkleDistributor?: `0x${string}`;
  creditRegistry?: `0x${string}`;
  metaMorphoFactory?: `0x${string}`;
  startBlock?: number;
  vaults: Record<string, `0x${string}`>;
  oracles: Record<string, `0x${string}`>;
  markets: Record<string, { id: `0x${string}`; oracle: `0x${string}` }>;
} = {
  vaults: {},
  oracles: {},
  markets: {},
};

export const BPS = 10_000n;
export const ORACLE_PRICE_SCALE = 10n ** 36n;
export const WAD = 10n ** 18n;
