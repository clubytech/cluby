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

/** Filled by the deploy script output (contracts/broadcast). Empty until the canary deploy. */
export const deployments: {
  market?: `0x${string}`;
  irm?: `0x${string}`;
  oracle?: `0x${string}`;
  lens?: `0x${string}`;
  shortRouter?: `0x${string}`;
  flashLiquidator?: `0x${string}`;
  startBlock?: number;
  markets: Record<string, { id: `0x${string}`; symbol: StockSymbol }>;
} = {
  markets: {},
};

export const BPS = 10_000n;
export const ORACLE_PRICE_SCALE = 10n ** 36n;
export const WAD = 10n ** 18n;

/**
 * Morpho Blue stack on Robinhood Chain (4663).
 * `verified` = `eth_getCode` returned bytecode on the public RPC (checked 2026-09-04, block tip).
 * The vault factory, Bundler3, PreLiquidationFactory and PublicAllocator are NOT deployed at their
 * Ethereum/Base addresses on this chain — probed and empty — so a MetaMorpho V1.1 factory of our own
 * is the path to a vault (MVP block 1 fallback).
 */
export const morpho = {
  blue: {
    address: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010",
    verified: true,
    codeSize: 15582,
  },
  adaptiveCurveIrm: {
    address: "0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1",
    verified: true,
    codeSize: 2282,
  },
  chainlinkOracleV2Factory: {
    address: "0xB7c16F6F8cF531447Bf27Ca7220f981E79C9cdF2",
    verified: true,
    codeSize: 4464,
  },
  /** Not found on 4663. Deploy MetaMorpho V1.1 factory from Morpho sources before the vault block. */
  metaMorphoFactory: { address: null, verified: false },
  bundler3: { address: null, verified: false },
  preLiquidationFactory: { address: null, verified: false },
} as const;

/** LLTV tiers, immutable once a market is created (MVP.md rule 4). */
export const LLTV = {
  stock: 625_000_000_000_000_000n, // 0.625e18
  eth: 770_000_000_000_000_000n, // 0.77e18
  longTail: 385_000_000_000_000_000n, // 0.385e18
} as const;

export type MarketTier = "stock" | "eth" | "longTail";

/** The four MVP markets. Loan token is USDG everywhere. Caps in USDG units (6 decimals). */
export const plannedMarkets = [
  { symbol: "NVDA", collateral: "NVDA", tier: "stock", lltv: LLTV.stock, supplyCap: 1_000_000_000n, category: "Stocks" },
  { symbol: "SPY", collateral: "SPY", tier: "stock", lltv: LLTV.stock, supplyCap: 1_000_000_000n, category: "ETF" },
  { symbol: "AAPL", collateral: "AAPL", tier: "stock", lltv: LLTV.stock, supplyCap: 1_000_000_000n, category: "Stocks" },
  { symbol: "ETH", collateral: "WETH", tier: "eth", lltv: LLTV.eth, supplyCap: 2_000_000_000n, category: "Crypto" },
] as const;

/** UI never lets a position open at the very edge of LLTV. */
export const SAFE_CAP_MARGIN = { stock: 5n, eth: 5n, longTail: 8n } as const; // percentage points

/** Vault: Core USDG, performance fee 0 for the MVP (MVP.md rule 1). */
export const vaultConfig = {
  name: "Cluby Core USDG",
  symbol: "cUSDG",
  asset: "USDG",
  performanceFeeWad: 0n,
  initialDepositUsdg: 100_000_000n, // $100
} as const;
