import {
  FEED_MAX_AGE,
  LLTV,
  SAFE_CAP_MARGIN,
  deployments,
  economics,
  external,
  marketCatalog,
  morpho,
  stocks,
  tokens,
  vaultCatalog,
  type ListingStatus,
  type MarketDef,
  type MarketSide,
  type OracleKind,
} from "@cluby/config";
import { chainlinkFeedAbi, irmAbi, morphoBlueAbi } from "./abi";
import { publicClient } from "./chain";

export type MarketView = {
  key: string;
  side: MarketSide;
  /** Symbol the row is named after: the collateral on a long, the borrowed stock on a short. */
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
  oracle: OracleKind;
  feed: `0x${string}` | null;
  price: number | null;
  priceAge: number | null;
  priceStale: boolean;
  supplyCapUsd: number;
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  liquidityUsd: number;
  utilization: number;
  borrowApr: number | null;
  supplyApr: number | null;
  marketId: `0x${string}` | null;
};

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

function ratePerSecondToApr(ratePerSecondWad: bigint): number {
  // Morpho accrues continuously, so the honest yearly figure is e^(r·t) − 1, not r·t.
  return Math.expm1((Number(ratePerSecondWad) / 1e18) * SECONDS_PER_YEAR);
}

function tokenAddress(symbol: string): `0x${string}` | null {
  if (symbol in tokens) return tokens[symbol as keyof typeof tokens].address as `0x${string}`;
  if (symbol in stocks) return stocks[symbol as keyof typeof stocks].address as `0x${string}`;
  return null;
}

function feedAddress(symbol: string): `0x${string}` | null {
  if (symbol === "WETH" || symbol === "ETH") return external.ethUsdFeed as `0x${string}`;
  const s = stocks[symbol as keyof typeof stocks];
  if (s && "feed" in s && s.feed) return s.feed as `0x${string}`;
  return null;
}

/** The asset whose price the row is about: what you post on a long, what you owe on a short. */
function subjectSymbol(m: MarketDef): string {
  return m.side === "long" ? m.collateral : m.loan;
}

const priceCache = new Map<string, { at: number; price: number | null; age: number | null }>();

async function readPrice(feed: `0x${string}` | null) {
  if (!feed) return { price: null, age: null };
  const hit = priceCache.get(feed);
  if (hit && Date.now() - hit.at < 15_000) return { price: hit.price, age: hit.age };
  try {
    const [data, decimals] = await Promise.all([
      publicClient.readContract({ address: feed, abi: chainlinkFeedAbi, functionName: "latestRoundData" }),
      publicClient.readContract({ address: feed, abi: chainlinkFeedAbi, functionName: "decimals" }),
    ]);
    const answer = data[1];
    if (answer <= 0n) throw new Error("feed has no answer");
    const out = {
      price: Number(answer) / 10 ** Number(decimals),
      age: Math.max(0, Math.floor(Date.now() / 1000) - Number(data[3])),
    };
    priceCache.set(feed, { at: Date.now(), ...out });
    return out;
  } catch {
    return { price: null, age: null };
  }
}

async function readMarketState(marketId: `0x${string}`) {
  const [params, state] = await Promise.all([
    publicClient.readContract({
      address: morpho.blue.address as `0x${string}`,
      abi: morphoBlueAbi,
      functionName: "idToMarketParams",
      args: [marketId],
    }),
    publicClient.readContract({
      address: morpho.blue.address as `0x${string}`,
      abi: morphoBlueAbi,
      functionName: "market",
      args: [marketId],
    }),
  ]);

  let borrowApr: number | null = null;
  try {
    const rate = await publicClient.readContract({
      address: morpho.adaptiveCurveIrm.address as `0x${string}`,
      abi: irmAbi,
      functionName: "borrowRateView",
      args: [
        { loanToken: params[0], collateralToken: params[1], oracle: params[2], irm: params[3], lltv: params[4] },
        {
          totalSupplyAssets: state[0],
          totalSupplyShares: state[1],
          totalBorrowAssets: state[2],
          totalBorrowShares: state[3],
          lastUpdate: state[4],
          fee: state[5],
        },
      ],
    });
    borrowApr = ratePerSecondToApr(rate);
  } catch {
    borrowApr = null;
  }

  return { state, borrowApr };
}

/**
 * Every market in the catalog, priced live. A market that has not been created on chain still
 * carries a real oracle price — the Chainlink feed exists whether or not our market does — but its
 * sizes read zero and its status says why.
 */
export async function getMarkets(): Promise<MarketView[]> {
  return Promise.all(
    marketCatalog.map(async (m) => {
      const subject = subjectSymbol(m);
      const feed = feedAddress(subject);
      const { price, age } = await readPrice(feed);
      const lltv = Number(LLTV[m.tier]) / 1e18;
      const safeLtv = Math.max(0, lltv - SAFE_CAP_MARGIN[m.tier] / 100);
      const maxAge = m.category === "Crypto" ? FEED_MAX_AGE.crypto : FEED_MAX_AGE.stock;
      const deployed = deployments.markets[m.key];
      const marketId = (deployed?.id ?? null) as `0x${string}` | null;
      const loanDecimals = m.loan === "USDG" ? 6 : 18;

      const base = {
        key: m.key,
        side: m.side,
        subject,
        collateralSymbol: m.collateral,
        loanSymbol: m.loan,
        collateralAddress: tokenAddress(m.collateral),
        category: m.category,
        note: m.note ?? null,
        lltv,
        safeLtv,
        // Leverage a Multiply position can reach against this LLTV (PLAN §1.5).
        maxLeverage: safeLtv >= 1 ? 0 : 1 / (1 - safeLtv),
        oracle: m.oracle,
        feed,
        price,
        priceAge: age,
        priceStale: age !== null && age > maxAge,
        supplyCapUsd: m.supplyCapUsd,
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

      const { state, borrowApr } = await readMarketState(marketId);
      const unit = 10 ** loanDecimals;
      const supply = Number(state[0]) / unit;
      const borrow = Number(state[2]) / unit;
      // A stock-denominated market is sized in shares; value it with the same oracle price.
      const toUsd = m.loan === "USDG" ? 1 : (price ?? 0);
      const utilization = supply === 0 ? 0 : borrow / supply;
      const feeShare = 1 - Number(economics.introFeeWad) / 1e18;

      return {
        ...base,
        status: "listed" as const,
        totalSupplyUsd: supply * toUsd,
        totalBorrowUsd: borrow * toUsd,
        liquidityUsd: Math.max(0, (supply - borrow) * toUsd),
        utilization,
        borrowApr,
        supplyApr: borrowApr === null ? null : borrowApr * utilization * feeShare,
      };
    }),
  );
}

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
  markets: MarketView[];
};

export async function getVaults(): Promise<VaultView[]> {
  const markets = await getMarkets();
  const byKey = new Map(markets.map((m) => [m.key, m]));

  return vaultCatalog.map((v) => {
    const mine = v.markets.map((k) => byKey.get(k)).filter((m): m is MarketView => Boolean(m));
    const listed = mine.filter((m) => m.status === "listed");
    const totalAssets = listed.reduce((a, m) => a + m.totalSupplyUsd, 0);
    const withdrawable = listed.reduce((a, m) => a + m.liquidityUsd, 0);
    const apy =
      totalAssets === 0
        ? null
        : listed.reduce((a, m) => a + (m.supplyApr ?? 0) * m.totalSupplyUsd, 0) / totalAssets;

    return {
      key: v.key,
      kind: v.kind,
      name: v.name,
      symbol: v.symbol,
      asset: v.asset,
      description: v.description,
      status: listed.length > 0 ? ("listed" as const) : v.status,
      address: (deployments.vaults[v.key] ?? null) as `0x${string}` | null,
      performanceFee: Number(economics.introFeeWad) / 1e18,
      introFeeDays: economics.introDays,
      totalAssetsUsd: totalAssets,
      withdrawableUsd: withdrawable,
      apy,
      markets: mine,
    };
  });
}

export async function getProtocolStats() {
  const markets = await getMarkets();
  const longs = markets.filter((m) => m.side === "long");
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
    longCount: longs.length,
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
    },
    contracts: {
      morphoBlue: morpho.blue.address,
      irm: morpho.adaptiveCurveIrm.address,
      oracleFactory: morpho.chainlinkOracleV2Factory.address,
    },
  };
}
