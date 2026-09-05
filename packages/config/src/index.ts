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

  // Added from the on-chain census (docs/market-census.md). Every address below was proved the
  // hard way: the token is a BeaconProxy on the Robinhood stock beacon, its symbol() is its own,
  // and each feed's description() names the ticker it is pinned to. None came from a symbol search.
  BABA: {
    address: "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4",
    feed: "0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984",
    feedAggregator: "0xFf5F85e4888782e66f1dd9cabaDF4822Fbeb1439",
    usdgPool: { address: "0xa57ab582b310dd6f9e934EA1EEEa152741545E6A", fee: 3000, cardinality: 300 },
    name: "Alibaba",
    exchange: "NYSE",
  },
  GME: {
    address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E",
    feed: "0x27C71df6A64fB476468EdF256CF72c038baB5B67",
    feedAggregator: "0xf83Cde62D1Cd90dE8d2Bf3332B90c590985aD679",
    usdgPool: { address: "0xE2b46c905E12Ab8E2f864e4821a4325884C1B126", fee: 500, cardinality: 1500 },
    name: "GameStop",
    exchange: "NYSE",
  },
  DELL: {
    address: "0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd",
    feed: "0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b",
    feedAggregator: "0xD6ed4e7D4ABA1111EB42A349899b5c72EE1C9FEF",
    usdgPool: { address: "0xc30c89cB7815A1488b7998D15eEC73961707Fc5a", fee: 10000, cardinality: 1500 },
    name: "Dell",
    exchange: "NYSE",
  },
  PLTR: {
    address: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A",
    feed: "0x820ABedFF239034956B7A9d2F0a331f9F075eB4c",
    feedAggregator: "0x315afd0f71D5407B99ad19ab001a67af40fbAAF4",
    usdgPool: { address: "0x851680416A4f4E1c463d45171d61ACDdBc8554c0", fee: 3000, cardinality: 1801 },
    name: "Palantir Technologies",
    exchange: "Nasdaq",
  },
  SNDK: {
    address: "0xB90A19fF0Af67f7779afF50A882A9CfF42446400",
    feed: "0xfb133Fa4B7b385802B693a293606682Df47109A3",
    feedAggregator: "0x7B2FdfcEa772f093DD33b3aCF8EE294B368f6c23",
    usdgPool: { address: "0xA1e1C9519cD5ae47e9A935645E1A7b935b944559", fee: 10000, cardinality: 1400 },
    name: "Sandisk Corporation",
    exchange: "Nasdaq",
  },
  AMD: {
    address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC",
    feed: "0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72",
    feedAggregator: "0xdAD54b8Ee51Af258e5A6Faa9a84a3300f4775f7d",
    usdgPool: { address: "0x48D284A2A4d3DC1b3Da08231Fe44317e7e7Aa51f", fee: 3000, cardinality: 1400 },
    name: "AMD",
    exchange: "Nasdaq",
  },
  MU: {
    address: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD",
    feed: "0x425EEFdCf05ed6526C3cE61Af99429A228a6d596",
    feedAggregator: "0xA088FaD0A0A62693aF068E2EdB80B1578c8A9365",
    usdgPool: { address: "0xd057B1Bc54917855BBee58eAd58647f47caB35E5", fee: 3000, cardinality: 1801 },
    name: "Micron Technology",
    exchange: "Nasdaq",
  },
  INTC: {
    address: "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681",
    feed: "0x3f390C5C24628Ac7C489515402235FeAD71D1913",
    feedAggregator: "0x95fB52f75aEcBCa8E12aA4403f840C8bc18CFbd4",
    usdgPool: { address: "0x2e5a92f5013a64661A49312111be2e8aBd33F56a", fee: 3000, cardinality: 1500 },
    name: "Intel",
    exchange: "Nasdaq",
  },
  TSM: {
    address: "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA",
    feed: "0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F",
    feedAggregator: "0x2B3A9A18998e9464760658233ab093e6aEbF45d0",
    usdgPool: { address: "0x07e8Ea83D4C1340774c8965125e26e12bf943bf1", fee: 10000, cardinality: 1801 },
    name: "Taiwan Semiconductor Manufacturing",
    exchange: "NYSE",
  },
  CRCL: {
    address: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
    feed: "0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a",
    feedAggregator: "0x901D8DF245E48Dfc82D6483FC45b5BE6ddc5281a",
    usdgPool: { address: "0x654E4143e82a5824445Ade0824351C2A9ACD95a8", fee: 3000, cardinality: 1801 },
    name: "Circle Internet Group",
    exchange: "NYSE",
  },
  ASML: {
    address: "0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA",
    feed: "0xB4106147E8cce40b7d46124090d373A71b70f87D",
    feedAggregator: "0xF795030a46ad6CA4b07Bf5fB704dC36039118c9F",
    usdgPool: { address: "0xce79c1B7b5f9Ae1aab3B1796e7Fcd2F5F24cF265", fee: 3000, cardinality: 1 },
    name: "ASML Holding NV",
    exchange: "Nasdaq",
  },
  USO: {
    address: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344",
    feed: "0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c",
    feedAggregator: "0xa6aC45e27D19f91c55109191D71CfBA4A9f5fBe1",
    usdgPool: { address: "0x02175608F1b5E6b5ed221cCFdC7Be197D111D915", fee: 3000, cardinality: 1801 },
    name: "United States Oil Fund",
    exchange: "NYSE Arca",
  },
  SLV: {
    address: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f",
    feed: "0x209b73908e92Ae021826eD79609845451Ecba2ce",
    feedAggregator: "0xcdF6F7043b3aF6Afa0CAAACe1230B355096B5386",
    usdgPool: { address: "0x8cB787e6c315D464775289BaD00FDD67d53Ecb3D", fee: 3000, cardinality: 1801 },
    name: "iShares Silver Trust",
    exchange: "NYSE Arca",
  },
  USAR: {
    address: "0xd917B029C761D264c6A312BBbcDA868658eF86a6",
    feed: "0xA994d3684e8400A6c8078226925779FdeE682DD9",
    feedAggregator: "0x76ba75c6c362900B275D9D4d5C422F0275e85578",
    usdgPool: { address: "0x04391780F519B7d3ba59c9590459D76e23d225C4", fee: 3000, cardinality: 1400 },
    name: "USA Rare Earth",
    exchange: "Nasdaq",
  },
  MSTR: {
    address: "0xec262a75e413fAfD0dF80480274532C79D42da09",
    feed: "0x396118bdFB181e6240E74D243F266B061c0edc3D",
    feedAggregator: "0x55bd01F666c99E4590E084FdEfF88041BB50CCD1",
    usdgPool: { address: "0x17578C0e0D15da44f31677263114F71aE76653EA", fee: 10000, cardinality: 1500 },
    name: "Strategy Inc.",
    exchange: "Nasdaq",
  },
  AMC: {
    address: "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0xaA34feA710a1A737840329051D81D3B0B7C564d5", fee: 3000, cardinality: 300 },
    name: "AMC Entertainment",
    exchange: "NYSE",
  },
  TTWO: {
    address: "0x5e81213613b6B86EaB4c6c50d718d34359459786",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0xD9Ab4b7fAe6DC2f7020134Ec744A8F53Ef3E5E24", fee: 3000, cardinality: 360 },
    name: "Take-Two Interactive Software",
    exchange: "Nasdaq",
  },
  RDDT: {
    address: "0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0xa8744E76aED23B05F0126335E7BD38f7935D19fe", fee: 10000, cardinality: 1801 },
    name: "Reddit",
    exchange: "NYSE",
  },
  DJT: {
    address: "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0x31a89afd92F9397465649AD03226c52292fc1ae5", fee: 10000, cardinality: 1400 },
    name: "Trump Media & Technology Group",
    exchange: "Nasdaq",
  },
  GLD: {
    address: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0x7A6A053eCCf1446A2633E05aA6D40D09381997ec", fee: 3000, cardinality: 1400 },
    name: "SPDR Gold Trust",
    exchange: "NYSE Arca",
  },
  COST: {
    address: "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0x0a2121A50A09eD0796ae81F9c53fF9398355a398", fee: 3000, cardinality: 1801 },
    name: "Costco",
    exchange: "Nasdaq",
  },
  NFLX: {
    address: "0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0x59895C0302F41aEaa129D2fa2442CEc01E7eF45E", fee: 3000, cardinality: 1801 },
    name: "Netflix",
    exchange: "Nasdaq",
  },
  MRNA: {
    address: "0x43B07D15cE533bEc5476d70C22a78a1B2B662155",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0xA34d0667334074DF2d5BfD259e79E6B9cf1fA8Bf", fee: 10000, cardinality: 1400 },
    name: "Moderna",
    exchange: "Nasdaq",
  },
  RIVN: {
    address: "0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0xb30A75B200D98A600a3766869344928E35823E23", fee: 10000, cardinality: 1400 },
    name: "Rivian Automotive",
    exchange: "Nasdaq",
  },
  RBLX: {
    address: "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8",
    feed: undefined,
    feedAggregator: undefined,
    usdgPool: { address: "0x2ef5945cd5664876b6481FdacFaA2942995a4DA8", fee: 10000, cardinality: 1400 },
    name: "Roblox",
    exchange: "NYSE",
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
  /**
   * The usable identity handle, and the reason a squatter cannot get in.
   *
   * Every real tokenised stock on this chain is a BeaconProxy pointing at this beacon, so scanning
   * `BeaconUpgraded(address indexed beacon)` for it ENUMERATES the population -- 203 tokens, no
   * duplicate symbols, byte-identical runtime code -- rather than searching it. All twelve addresses
   * pinned here before the census land in that set unchanged.
   *
   * Checking the beacon slot (ERC-1967, `0xa3f0ad74...`) on a candidate is the whole verification.
   */
  beacon: "0xe10b6f6b275De231345C20d14aB812dB62151b00",
  beaconSlot: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
  /** The single shared Stock logic contract behind the beacon. */
  logic: "0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2",
  /**
   * NOT a CREATE deployer, despite the name: it is itself an ERC-1967 proxy, and enumerating CREATE
   * addresses from its nonces yields no live contracts. Kept because it is a real related address,
   * not because it identifies anything.
   */
  deployer: "0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046",
  implementation: "Stock",
  /** Selector that must not revert: uiMultiplier(). Weaker than the beacon, and it agrees with it. */
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
  /** Not deployed by Morpho here either; deployed from their sources at commit a9ef88fe. */
  preLiquidationFactory: { address: "0xe57CC1F0ED5E760D2EcAaa04a1E0d1c690daAa0e", verified: true },
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

  // The census additions. Caps are 2% of the deepest USDG pool for a Chainlink-priced market
  // and 1% for a TWAP-priced one -- halved because the pool that prices the collateral is the
  // pool that has to absorb it, so one push moves the oracle and the exit together. Floored to a
  // ladder, ceilinged at $25,000 for a first listing. Raise against realised liquidations, not
  // against the table.
  { key: "BABA", side: "long", collateral: "BABA", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "listed" },
  { key: "GME", side: "long", collateral: "GME", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 5000, status: "listed" },
  { key: "DELL", side: "long", collateral: "DELL", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 5000, status: "listed" },
  { key: "PLTR", side: "long", collateral: "PLTR", loan: "USDG", tier: "longTail", oracle: "chainlink", category: "Stocks", supplyCapUsd: 500, status: "listed" },
  { key: "SNDK", side: "long", collateral: "SNDK", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 1000, status: "listed" },
  { key: "AMD", side: "long", collateral: "AMD", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 1000, status: "listed" },
  { key: "MU", side: "long", collateral: "MU", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 10000, status: "listed" },
  { key: "INTC", side: "long", collateral: "INTC", loan: "USDG", tier: "longTail", oracle: "chainlink", category: "Stocks", supplyCapUsd: 500, status: "listed" },
  { key: "TSM", side: "long", collateral: "TSM", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "listed" },
  { key: "CRCL", side: "long", collateral: "CRCL", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 25000, status: "listed" },
  { key: "ASML", side: "long", collateral: "ASML", loan: "USDG", tier: "longTail", oracle: "chainlink", category: "Stocks", supplyCapUsd: 500, status: "listed" },
  { key: "USO", side: "long", collateral: "USO", loan: "USDG", tier: "stock", oracle: "chainlink", category: "ETF", supplyCapUsd: 5000, status: "listed" },
  { key: "SLV", side: "long", collateral: "SLV", loan: "USDG", tier: "stock", oracle: "chainlink", category: "ETF", supplyCapUsd: 5000, status: "listed" },
  { key: "USAR", side: "long", collateral: "USAR", loan: "USDG", tier: "longTail", oracle: "chainlink", category: "Stocks", supplyCapUsd: 250, status: "listed" },
  { key: "MSTR", side: "long", collateral: "MSTR", loan: "USDG", tier: "stock", oracle: "chainlink", category: "Stocks", supplyCapUsd: 2000, status: "listed" },
  { key: "AMC", side: "long", collateral: "AMC", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 10000, status: "planned", note: "Priced by a 30-minute TWAP; the pool ring is 300 slots and has to reach 1,800 before the oracle will build." },
  { key: "TTWO", side: "long", collateral: "TTWO", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 1000, status: "planned", note: "Priced by a 30-minute TWAP; the pool ring is 360 slots and has to reach 1,800 before the oracle will build." },
  { key: "RDDT", side: "long", collateral: "RDDT", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 5000, status: "listed" },
  { key: "DJT", side: "long", collateral: "DJT", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 2000, status: "planned", note: "Priced by a 30-minute TWAP; the pool ring is 1400 slots and has to reach 1,800 before the oracle will build." },
  { key: "GLD", side: "long", collateral: "GLD", loan: "USDG", tier: "longTail", oracle: "twap", category: "ETF", supplyCapUsd: 25000, status: "planned", note: "Priced by a 30-minute TWAP; the pool ring is 1400 slots and has to reach 1,800 before the oracle will build." },
  { key: "COST", side: "long", collateral: "COST", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 2000, status: "listed" },
  { key: "NFLX", side: "long", collateral: "NFLX", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 1000, status: "planned" },
  { key: "MRNA", side: "long", collateral: "MRNA", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 500, status: "planned", note: "Priced by a 30-minute TWAP; the pool ring is 1400 slots and has to reach 1,800 before the oracle will build." },
  { key: "RIVN", side: "long", collateral: "RIVN", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 1000, status: "planned", note: "Priced by a 30-minute TWAP; the pool ring is 1400 slots and has to reach 1,800 before the oracle will build." },
  { key: "RBLX", side: "long", collateral: "RBLX", loan: "USDG", tier: "longTail", oracle: "twap", category: "Stocks", supplyCapUsd: 1000, status: "planned", note: "Priced by a 30-minute TWAP; the pool ring is 1400 slots and has to reach 1,800 before the oracle will build." },
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
  safe?: `0x${string}`;
  deployer?: `0x${string}`;
  preLiquidationFactory?: `0x${string}`;
  preLiquidations?: Record<string, `0x${string}`>;
  owner?: `0x${string}`;
  startBlock?: number;
  vaults: Record<string, `0x${string}`>;
  oracles: Record<string, `0x${string}`>;
  markets: Record<string, { id: `0x${string}`; oracle: `0x${string}` }>;
} = {
  /**
   * Fourth Lens. The second (0x5FC2CD44…) divided by `collateral.wMulDown(lltv)` without checking
   * it for zero, so one raw unit of an 18-decimal collateral panicked the read — and took every
   * batch and every keeper pass that touched the market with it. The third (0x7148C4F9…) fixed
   * that but published the borrow rate off the accrued struct, which reads the IRM's own stale
   * rateAtTarget and skips the adaptation across the window: a rate half again too high on a
   * market nobody had touched for a week.
   */
  lens: "0x6159fbBe4d521fd673A496948910791d7eec7B58",
  /**
   * Third liquidator. The first (0xDCc269c0…) collapsed the flash-loan size and the swap floor into
   * one number; the second (0x91B3c5b8…) measured solvency against the size of the flash loan
   * rather than the repayment, and read no oracle at all, so the only floor on the sale price was
   * one the caller set for itself. Abandoned, not upgraded — none of them holds anything, so
   * replacing one costs a deploy and nothing else.
   */
  flashLiquidator: "0xC3374D9fB0CC9a85440f26EE461aF6Bfb6c6e7cE",
  /** Second router: the first (0xBF6cdE3F…) could not express closing a position outright. */
  leverageRouter: "0x12aD902c5004d5147D7F46dC97818cA26Fcb25cf",
  /** Scores only; it moves what a borrower is paid, never what they may borrow. */
  creditRegistry: "0x86e8f3Bf88087774a530d70FfaD19b5257054E53",
  /**
   * Safe 1.4.1+L2, 1-of-1 on the deploy key for now — add owners and raise the threshold from the
   * Safe itself. It owns the vault, the liquidator and the credit registry; the deploy key owns
   * nothing any more.
   */
  safe: "0x90a82053b9012b6ea2D95f88ee81da969d4D8A85",
  owner: "0x90a82053b9012b6ea2D95f88ee81da969d4D8A85",
  deployer: "0x9C5C4b4A985b0A60a1067a0d82020774661d074A",
  /** Block of the first Cluby deploy — where the indexer starts. */
  startBlock: 54451901,
  metaMorphoFactory: "0xD371727A6F3c5033204b6E4D5548EF4Ad40C9E20",
  preLiquidationFactory: "0xe57CC1F0ED5E760D2EcAaa04a1E0d1c690daAa0e",
  /**
   * Soft liquidation, per market. A borrower must authorise the instance on Morpho for anything to
   * happen — deploying one takes nothing away from anyone, it only makes the gentler path
   * available. Created for the markets the vault actually funds; the rest cost ~1.5M gas each and
   * can be added when they have liquidity.
   */
  preLiquidations: {
    NVDA: "0x93d97F5C84a85857965c0341289D246E25ce72De",
    SPY: "0x7A0A8B48FDcf7577A04F08D113aB40aD9E7d417e",
    ETH: "0x9c5bca1Cc5aC228bC60c63817A1E1c95e43A2098",
  } as Record<string, `0x${string}`>,
  vaults: {
    "core-usdg": "0x97e813828B0250dCa5c05FF2567dfD616E5b3C61",
  },
  oracles: {
    "NVDA": "0xB5736a58CE6370DaD1888d8996cf64A22e622BB8",
    "SPY": "0x1bb6b9792e9852CB7bfEB14A5951394D07817b7D",
    "AAPL": "0xB5034A0167655415ca08eB255f3b6c7E47c72Ed2",
    "TSLA": "0x621F64e2cb5AB5367B6Da286c3C126c6d7F5612F",
    "ETH": "0x3b43937193b444DDa2251a9A58442cDD5e90f7fD",
    "HIMS": "0x13Ed9699E98B15a1AEA6B09B043b29D3C89457Cd",
    "SPCX": "0x591BB612A232CD96a0B03DAa5bF75C6326AffdF4",
    "PONS": "0x1E5c7F62eda4E75F6897614f381cF35BE8647dF8",
    "CASHCAT": "0xC343BC067236ead2542AF9B317B7A6F64b9020b3",
    "MSFT": "0x62Af5087dcFeA9a1971865854B67a28Ffd3849AC",
    "GOOGL": "0x17D1246A32CB40e0dB59FBC1B49660CaFae6cE47",
    "AMZN": "0x2e5Ee5bA2F128d9aF283f365A0D8b816bD9fb2B7",
    "META": "0xFEEBcdB299115ED9BddF72D142296A122c722F9e",
    "QQQ": "0x886B223772133B2df2cE8974eF37F8079b80482B",
    "SGOV": "0x6507b6C441D46438f49882Eaf487e3aEABDD797A",
    "NVDA-SHORT": "0x2e72230DA46B888BB71d419d4e194577E43bF881",
    "TSLA-SHORT": "0x3D28890c7c929c996BFB1ff581aee503986274B0",
  },
  markets: {
    "NVDA": { id: "0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826", oracle: "0xB5736a58CE6370DaD1888d8996cf64A22e622BB8" },
    "SPY": { id: "0xf95832e36d9d8baf35eb78ce80cbed92d20198ba639659b3f9a2ab00ced0a0c1", oracle: "0x1bb6b9792e9852CB7bfEB14A5951394D07817b7D" },
    "AAPL": { id: "0x349f46c4c49ff76074e27a21fe49fd86511b06c764a6d46589ced02a40dc40d2", oracle: "0xB5034A0167655415ca08eB255f3b6c7E47c72Ed2" },
    "TSLA": { id: "0xf7e15b56bbb99e7b600032a4285e34b59953cbc42361367407f3c5966fd54478", oracle: "0x621F64e2cb5AB5367B6Da286c3C126c6d7F5612F" },
    "ETH": { id: "0x6722f53f25a8d6e73493893c4f7f80ddc535cf97c4a93116fd55296e714216ae", oracle: "0x3b43937193b444DDa2251a9A58442cDD5e90f7fD" },
    "HIMS": { id: "0xf9566d437f9ad34df3084aea5866d2765d5afb519b619ec3b9b2c2c4c1221bc8", oracle: "0x13Ed9699E98B15a1AEA6B09B043b29D3C89457Cd" },
    "SPCX": { id: "0xba5b95d86b3220d2ac264d30575e53d647472629d8febc117f4155666961b40c", oracle: "0x591BB612A232CD96a0B03DAa5bF75C6326AffdF4" },
    "PONS": { id: "0x802aecb45c6701afc9dc8bfc46c94fdf113f96bf220444907155b1bdaa80c7b3", oracle: "0x1E5c7F62eda4E75F6897614f381cF35BE8647dF8" },
    "CASHCAT": { id: "0xb32df78a9ad7f3d6dfe451833567288493a8d6d1551fec18b0554a0759b253f8", oracle: "0xC343BC067236ead2542AF9B317B7A6F64b9020b3" },
    "MSFT": { id: "0x7460c76e24436a2a187be2c584cdc84c01b6014e7704fb414744e4ce0456ca9d", oracle: "0x62Af5087dcFeA9a1971865854B67a28Ffd3849AC" },
    "GOOGL": { id: "0x35bc0628f10ba7e29cda1787ad9af465092b112ef409ab0dad857c4f53341c61", oracle: "0x17D1246A32CB40e0dB59FBC1B49660CaFae6cE47" },
    "AMZN": { id: "0x7e375e21ade5caf251eef3e820bf8eda0e08f1378fe4aaedad7ead437be3e0e1", oracle: "0x2e5Ee5bA2F128d9aF283f365A0D8b816bD9fb2B7" },
    "META": { id: "0x52a696df717bed55532a0cb16490cbe45b23f44e0bf4a4761968c9aa43fc4377", oracle: "0xFEEBcdB299115ED9BddF72D142296A122c722F9e" },
    "QQQ": { id: "0xdcb03716ad496e58390fb5c5d8b1f0a196f0b923482f17a3c231390a39e9fb67", oracle: "0x886B223772133B2df2cE8974eF37F8079b80482B" },
    "SGOV": { id: "0xb416b784f4925f4885ca1fa7d4a1469a10f300d6525bbe23411d62f711d991cc", oracle: "0x6507b6C441D46438f49882Eaf487e3aEABDD797A" },
    "NVDA-SHORT": { id: "0xfa02b9d58bb338ea1ac14d89c2586683bf7c209b60073662a7c0dfaa72078be1", oracle: "0x2e72230DA46B888BB71d419d4e194577E43bF881" },
    "TSLA-SHORT": { id: "0xdfc64ba716c6b04aed5d182b87f218da60908bf17129cabef0ffc9bffe65acc2", oracle: "0x3D28890c7c929c996BFB1ff581aee503986274B0" },

    // Census listings, 2026-09-05. Ids recovered from the broadcast receipts and each one
    // confirmed against `idToMarketParams` -- the simulation printed different addresses, as it
    // has before, so the chain is the only source that counts here.
    "AMD": { id: "0xe7c12d71f0ed01cd910ecbff6624737d2ef42f461e6c7e54b9c1d550f3865349", oracle: "0x75bBEAD4761D663C58097858ea72596574a5C160" },
    "ASML": { id: "0xd3926328455494296c5c484d5f7e169600c67c7c6443047adf8203f9b182235f", oracle: "0x1e92a0c8a5f2F934f02180050b64ECE689ab23b3" },
    "BABA": { id: "0x87479686089ea04b0ad36aaec410aa157401c05d26729a097b39e7b56ceeba46", oracle: "0x17E41f66223f35439D60dE7D71Dac657fBC5526e" },
    "COST": { id: "0xccdfcd98e6779322b28ecdc0c513ed3bd510ccb2fd15ee6a70d6cf142398db41", oracle: "0x3a1C456e53EAB70164f46d26f81504235ac09014" },
    "CRCL": { id: "0x87f4a3f273fc5bd538216c5bc80a07d1b36476ea9234ddd88f6e7ef3557b0ebc", oracle: "0x7Fd7FCDf781DcbEAE113243be5BD4f12fEd6Fa75" },
    "DELL": { id: "0xd93f83899ab5f9daa8b92d36850fc315aeb0dec8c8856b7f607682477bdd93f1", oracle: "0x118B8d4627484b27E6AD9FEc0567983552185a35" },
    "GME": { id: "0xb1011e5297cba2daa144a443d15e6fe3b7ce0315a495796587b2c723995eaec4", oracle: "0xDd03e41f7c46eE394Ce8448A4101845AA5990521" },
    "INTC": { id: "0x685273c261e143b9e594f6fad9bfde278dfb4e9a2cdfb394457495041c464a64", oracle: "0xC296F27753ee7F533803F22FF33Fa53B8C81F21A" },
    "MSTR": { id: "0x00bcba8b02759f13138726964a535bd7150aff98b955d0d6a0f65963d6559735", oracle: "0xAF8c2596c36C7071F3a5ECEe18b6E6E19f4F4fA7" },
    "MU": { id: "0xdffe5769f80af1a6e0b5c055bb3c459ca373c98e0e011092b7af125a6a0229bc", oracle: "0x685983F76B0EC3EDf01203E15e3c7d34f613411D" },
    "PLTR": { id: "0x45e3e8e4320fc21e1f5dec5181484243f4ebd360c78b6f0338265c852c1eb5df", oracle: "0x036E49BD73204A695526Aa40D9fd860462d37200" },
    "RDDT": { id: "0x40b8233028846e58fc22dca599a503d77bfc131b1f02d8c622bf8efa64ea6c97", oracle: "0xAc527aF81B3b37bF876243A6502EfD3674e9A504" },
    "SLV": { id: "0x0ddf572451b4ddf71b85b0b1b0083b412b71caa7474be4afd9ed8465ca4fad56", oracle: "0x3A11E5919e1e742BBe7B2a501A1a70b60957fD38" },
    "SNDK": { id: "0xafb1f7bd3f572bb4a6c74ab38ccdb5b00e78d2928d2dc9a7049e5e4210b8d6c0", oracle: "0x0ebC9e0F926940e5E61E4D8e3cD785dea7605A6f" },
    "TSM": { id: "0x859b05cd73f0c4117b97591ca5b4425c8f54cfedfba72ed6347ceeab3d9beb3e", oracle: "0xaD11575B693b23BD916571B3A4939cDADC545C33" },
    "USAR": { id: "0xd2425a1980f10e53096076ecbd43d837b5e5252896990686f0618a24725419b6", oracle: "0x4Bb9E561eb19D729718Eb167E99dbbdD83aa32Bc" },
    "USO": { id: "0x2fa92894e626cf6671c152a1e44d98bf5dda5361c93bf4957e8b4398c204b832", oracle: "0x76128FD445d4E1785e59daA6B2BA2216436D9707" },
  },
};

export const BPS = 10_000n;
export const ORACLE_PRICE_SCALE = 10n ** 36n;
export const WAD = 10n ** 18n;
