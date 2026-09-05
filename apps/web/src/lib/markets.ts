import {
  deployments,
  economics,
  LLTV,
  marketCatalog,
  morpho,
  vaultCatalog,
  type ListingStatus,
  type MarketSide,
  type OracleKind,
} from "@cluby/config";
import {
  decimalsOf,
  feedOf,
  getMarketParams,
  getMarketState,
  getRates,
  getVaultMarketConfig,
  getVaultState,
  maxAgeOf,
  poolOf,
  readFeed,
  readTwap,
  safeLtvOf,
  subjectOf,
  tokenAddressOf,
} from "@cluby/sdk";
import { publicClient } from "./chain";

export type PriceSource = "chainlink" | "twap" | null;

export type MarketView = {
  key: string;
  side: MarketSide;
  subject: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralAddress: `0x${string}` | null;
  category: string;
  status: ListingStatus;
  note: string | null;
  lltv: number;
  safeLtv: number;
  maxLeverage: number;
  poolFee: number;
  oracle: OracleKind;
  feed: `0x${string}` | null;
  price: number | null;
  priceSource: PriceSource;
  priceAge: number | null;
  priceStale: boolean;
  supplyCapUsd: number;
  /** Soft-liquidation instance, when one exists. Opt-in: it can do nothing until the borrower
   * authorises it on Morpho. */
  preLiquidation: `0x${string}` | null;
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  liquidityUsd: number;
  utilization: number;
  borrowApr: number | null;
  supplyApr: number | null;
  marketId: `0x${string}` | null;
};

const USDG_DECIMALS = 6;
/** Long enough that a single swap cannot move it, short enough to track a real move (PLAN §1.3). */
const TWAP_WINDOW = 1800;

/**
 * One price per subject asset. A Chainlink feed is preferred; assets without one — the memecoins
 * and HIMS — are priced by the pool TWAP, which is also what their oracle contract will read.
 */
async function priceOf(subject: string): Promise<{ price: number | null; age: number | null; source: PriceSource }> {
  const feed = feedOf(subject);
  if (feed) {
    const read = await readFeed(publicClient, feed);
    if (read) return { price: read.price, age: read.ageSeconds, source: "chainlink" };
  }
  const pool = poolOf(subject);
  const token = tokenAddressOf(subject);
  if (pool && token) {
    const twap = await readTwap(publicClient, pool.address as `0x${string}`, token, "0x", {
      windowSeconds: TWAP_WINDOW,
      tokenDecimals: decimalsOf(subject),
      quoteDecimals: USDG_DECIMALS,
    });
    // A TWAP is as fresh as its window: it is an average over the last half hour by construction.
    if (twap) return { price: twap.price, age: TWAP_WINDOW, source: "twap" };
  }
  return { price: null, age: null, source: null };
}

/**
 * One in-flight read shared by every caller. Each page needs the same market list, and a build
 * renders dozens of them at once — without this the same eighteen feeds get read thirty times over
 * and the RPC starts refusing, which surfaces as an unrelated-looking viem error mid-build.
 */
let cached: { at: number; promise: Promise<MarketView[]> } | null = null;
const CACHE_MS = 15_000;

export async function getMarkets(): Promise<MarketView[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = readMarkets();
  cached = { at: Date.now(), promise };
  // A failed read must not be cached, or one bad moment poisons the next fifteen seconds.
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

async function readMarkets(): Promise<MarketView[]> {
  const priced = new Map<string, Awaited<ReturnType<typeof priceOf>>>();
  await Promise.all(
    Array.from(new Set(marketCatalog.map(subjectOf))).map(async (s) => priced.set(s, await priceOf(s))),
  );

  return Promise.all(
    marketCatalog.map(async (m) => {
      const subject = subjectOf(m);
      const { price, age, source } = priced.get(subject) ?? { price: null, age: null, source: null };
      const lltv = Number(LLTV[m.tier]) / 1e18;
      const safeLtv = safeLtvOf(m);
      const deployed = deployments.markets[m.key];
      const marketId = (deployed?.id ?? null) as `0x${string}` | null;

      const base = {
        key: m.key,
        side: m.side,
        subject,
        collateralSymbol: m.collateral,
        loanSymbol: m.loan,
        collateralAddress: tokenAddressOf(m.collateral),
        category: m.category,
        note: m.note ?? null,
        lltv,
        safeLtv,
        maxLeverage: safeLtv >= 1 ? 0 : 1 / (1 - safeLtv),
        oracle: m.oracle,
        feed: feedOf(subject),
        price,
        priceSource: source,
        priceAge: age,
        priceStale: source === "chainlink" && age !== null && age > maxAgeOf(m),
        supplyCapUsd: m.supplyCapUsd,
        /**
         * The fee tier of the pool a leveraged position is actually swapped through.
         *
         * Multiply used to send a hard-coded 500 for every market. NVDA happens to have a 500 pool,
         * which is why it went unnoticed — but only seven of these forty do. Twenty-one are 3000 and
         * twelve are 10000, and asking the router to route through a tier that does not exist is a
         * revert with nothing useful in it.
         */
        poolFee: poolOf(subject)?.fee ?? 3000,
        preLiquidation: (deployments.preLiquidations?.[m.key] ?? null) as `0x${string}` | null,
        marketId,
      };

      if (!marketId) {
        return {
          ...base,
          status: m.status,
          totalSupplyUsd: 0,
          totalBorrowUsd: 0,
          liquidityUsd: 0,
          utilization: 0,
          borrowApr: null,
          supplyApr: null,
        };
      }

      const onChain = await Promise.all([
        getMarketParams(publicClient, marketId),
        getMarketState(publicClient, marketId),
      ]).catch(() => null);

      // The market exists but the node would not answer. Show it as listed with no figures rather
      // than failing the whole page: a missing number is honest, a crashed route is not.
      if (!onChain) {
        return {
          ...base,
          status: "listed" as const,
          totalSupplyUsd: 0,
          totalBorrowUsd: 0,
          liquidityUsd: 0,
          utilization: 0,
          borrowApr: null,
          supplyApr: null,
        };
      }

      const [params, state] = onChain;
      const rates = await getRates(publicClient, params, state).catch(() => null);
      const unit = 10 ** (m.loan === "USDG" ? USDG_DECIMALS : 18);
      const supply = Number(state.totalSupplyAssets) / unit;
      const borrow = Number(state.totalBorrowAssets) / unit;
      // A stock-denominated market is sized in shares; value it with the same price the oracle uses.
      const toUsd = m.loan === "USDG" ? 1 : (price ?? 0);

      return {
        ...base,
        status: "listed" as const,
        totalSupplyUsd: supply * toUsd,
        totalBorrowUsd: borrow * toUsd,
        liquidityUsd: Math.max(0, (supply - borrow) * toUsd),
        utilization: rates?.utilization ?? 0,
        borrowApr: rates?.borrowApy ?? null,
        supplyApr: rates?.supplyApy ?? null,
      };
    }),
  );
}

export type VaultCap = { key: string; capUsd: number; enabled: boolean };

export type VaultView = {
  key: string;
  kind: string;
  name: string;
  symbol: string;
  asset: string;
  description: string;
  status: ListingStatus;
  address: `0x${string}` | null;
  performanceFee: number;
  introFeeDays: number;
  totalAssetsUsd: number;
  withdrawableUsd: number;
  apy: number | null;
  /** Seconds an owner must wait before a parameter change takes effect. Zero means none yet. */
  timelockSeconds: number;
  caps: VaultCap[];
  markets: MarketView[];
};

export async function getVaults(): Promise<VaultView[]> {
  const markets = await getMarkets();
  const byKey = new Map(markets.map((m) => [m.key, m]));

  return Promise.all(
    vaultCatalog.map(async (v) => {
      const mine = v.markets.map((k) => byKey.get(k)).filter((m): m is MarketView => Boolean(m));
      const listed = mine.filter((m) => m.status === "listed");
      const address = (deployments.vaults[v.key] ?? null) as `0x${string}` | null;

      // Rates come from the markets the vault lends into, weighted by what sits in each.
      const suppliedTotal = listed.reduce((a, m) => a + m.totalSupplyUsd, 0);
      const apy =
        suppliedTotal === 0
          ? null
          : listed.reduce((a, m) => a + (m.supplyApr ?? 0) * m.totalSupplyUsd, 0) / suppliedTotal;

      const base = {
        key: v.key,
        kind: v.kind,
        name: v.name,
        symbol: v.symbol,
        asset: v.asset,
        description: v.description,
        address,
        performanceFee: Number(economics.introFeeWad) / 1e18,
        introFeeDays: economics.introDays,
        apy,
        markets: mine,
      };

      if (!address) {
        return {
          ...base,
          status: v.status,
          totalAssetsUsd: 0,
          withdrawableUsd: 0,
          timelockSeconds: 0,
          caps: [],
        };
      }

      // Deployed: the vault's own accounting is the truth, not a sum over markets.
      const state = await getVaultState(publicClient, address).catch(() => null);
      const caps = await Promise.all(
        mine.map(async (m) => {
          if (!m.marketId) return { key: m.key, capUsd: 0, enabled: false };
          const c = await getVaultMarketConfig(publicClient, address, m.marketId).catch(() => null);
          return { key: m.key, capUsd: c ? Number(c.cap) / 1e6 : 0, enabled: c?.enabled ?? false };
        }),
      );

      return {
        ...base,
        status: "listed" as const,
        totalAssetsUsd: state ? Number(state.totalAssets) / 1e6 : 0,
        performanceFee: state ? Number(state.fee) / 1e18 : base.performanceFee,
        // What can leave right now is what the markets have not lent out.
        withdrawableUsd: Math.min(
          state ? Number(state.totalAssets) / 1e6 : 0,
          listed.reduce((a, m) => a + m.liquidityUsd, 0),
        ),
        timelockSeconds: state ? Number(state.timelock) : 0,
        caps,
      };
    }),
  );
}

export async function getProtocolStats() {
  const markets = await getMarkets();
  const shorts = markets.filter((m) => m.side === "short");
  const totalSupplyUsd = markets.reduce((a, m) => a + m.totalSupplyUsd, 0);
  const totalBorrowUsd = markets.reduce((a, m) => a + m.totalBorrowUsd, 0);

  return {
    chainId: 4663,
    totalSupplyUsd,
    totalBorrowUsd,
    liquidityUsd: totalSupplyUsd - totalBorrowUsd,
    utilization: totalSupplyUsd === 0 ? 0 : totalBorrowUsd / totalSupplyUsd,
    marketCount: markets.length,
    listedCount: markets.filter((m) => m.status === "listed").length,
    plannedCount: markets.filter((m) => m.status === "planned").length,
    blockedCount: markets.filter((m) => m.status === "blocked").length,
    longCount: markets.length - shorts.length,
    shortCount: shorts.length,
    shortInterestUsd: shorts.reduce((a, m) => a + m.totalBorrowUsd, 0),
    capUsd: markets.reduce((a, m) => a + m.supplyCapUsd, 0),
    feedsAnswering: markets.filter((m) => m.price !== null).length,
    lltvTiers: Object.fromEntries(Object.entries(LLTV).map(([k, v]) => [k, Number(v) / 1e18])),
    economics: {
      performanceFee: Number(economics.performanceFeeWad) / 1e18,
      introFee: Number(economics.introFeeWad) / 1e18,
      introDays: economics.introDays,
      borrowRebate: economics.borrowRebate,
      builderShare: economics.builderShare,
      flashLoanFee: economics.flashLoanFee,
      feeSplit: economics.feeSplit,
      creatorFeeToStakers: economics.tokenCreatorFeeToStakers,
    },
    contracts: {
      morphoBlue: morpho.blue.address,
      irm: morpho.adaptiveCurveIrm.address,
      oracleFactory: morpho.chainlinkOracleV2Factory.address,
    },
  };
}
