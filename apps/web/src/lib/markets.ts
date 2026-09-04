import {
  LLTV,
  SAFE_CAP_MARGIN,
  deployments,
  external,
  morpho,
  plannedMarkets,
  stocks,
  tokens,
  vaultConfig,
} from "@cluby/config";
import { chainlinkFeedAbi, irmAbi, morphoBlueAbi } from "./abi";
import { publicClient } from "./chain";

export type MarketStatus = "live" | "pending";

export type MarketView = {
  symbol: string;
  collateralSymbol: string;
  collateralAddress: `0x${string}`;
  category: string;
  status: MarketStatus;
  /** 0.625 for a 62.5% market. */
  lltv: number;
  /** LLTV minus the UI margin — the highest LTV the app will let you open at. */
  safeLtv: number;
  oracleKind: "chainlink" | "twap";
  feed: `0x${string}` | null;
  /** Collateral price in USD, straight off the Chainlink feed. Null when the feed did not answer. */
  price: number | null;
  /** Seconds since the feed last moved. Stock feeds are 24/5 and stand still all weekend. */
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
/** A stock feed that has not moved for longer than this is past a normal weekend pause. */
const STOCK_STALE_AFTER = 5 * 24 * 60 * 60;
const CRYPTO_STALE_AFTER = 24 * 60 * 60;

function ratePerSecondToApr(ratePerSecondWad: bigint): number {
  const perSecond = Number(ratePerSecondWad) / 1e18;
  // Morpho compounds continuously; APY = e^(r·t) − 1.
  return Math.expm1(perSecond * SECONDS_PER_YEAR);
}

function feedFor(symbol: string): `0x${string}` | null {
  if (symbol === "ETH") return external.ethUsdFeed as `0x${string}`;
  const stock = stocks[symbol as keyof typeof stocks];
  return (stock && "feed" in stock ? (stock.feed as `0x${string}`) : null) ?? null;
}

function collateralAddress(symbol: string): `0x${string}` {
  if (symbol === "WETH") return tokens.WETH.address as `0x${string}`;
  return stocks[symbol as keyof typeof stocks].address as `0x${string}`;
}

async function readPrice(feed: `0x${string}` | null) {
  if (!feed) return { price: null, age: null };
  try {
    const [data, decimals] = await Promise.all([
      publicClient.readContract({ address: feed, abi: chainlinkFeedAbi, functionName: "latestRoundData" }),
      publicClient.readContract({ address: feed, abi: chainlinkFeedAbi, functionName: "decimals" }),
    ]);
    const answer = data[1];
    const updatedAt = Number(data[3]);
    if (answer <= 0n) return { price: null, age: null };
    return {
      price: Number(answer) / 10 ** Number(decimals),
      age: Math.max(0, Math.floor(Date.now() / 1000) - updatedAt),
    };
  } catch {
    return { price: null, age: null };
  }
}

/**
 * One market as the site shows it. Until `CreateMarkets.s.sol` has run, a market has no id on
 * chain: everything sized in USDG reads zero and the row says "pending" — the price is still real,
 * because the Chainlink feed exists whether or not our market does.
 */
export async function getMarkets(): Promise<MarketView[]> {
  return Promise.all(
    plannedMarkets.map(async (m) => {
      const feed = feedFor(m.symbol);
      const deployed = deployments.markets[m.symbol];
      const marketId = (deployed?.id ?? null) as `0x${string}` | null;
      const { price, age } = await readPrice(feed);
      const lltv = Number(m.lltv) / 1e18;
      const margin = Number(SAFE_CAP_MARGIN[m.tier as keyof typeof SAFE_CAP_MARGIN]) / 100;
      const staleAfter = m.tier === "eth" ? CRYPTO_STALE_AFTER : STOCK_STALE_AFTER;

      const base = {
        symbol: m.symbol,
        collateralSymbol: m.collateral,
        collateralAddress: collateralAddress(m.collateral),
        category: m.category,
        lltv,
        safeLtv: Math.max(0, lltv - margin),
        oracleKind: "chainlink" as const,
        feed,
        price,
        priceAge: age,
        priceStale: age !== null && age > staleAfter,
        supplyCapUsd: Number(m.supplyCap) / 1e6,
        marketId,
      };

      if (!marketId) {
        return {
          ...base,
          status: "pending" as const,
          totalSupplyUsd: 0,
          totalBorrowUsd: 0,
          liquidityUsd: 0,
          utilization: 0,
          borrowApr: null,
          supplyApr: null,
        };
      }

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

      const totalSupply = Number(state[0]) / 1e6;
      const totalBorrow = Number(state[2]) / 1e6;
      const utilization = totalSupply === 0 ? 0 : totalBorrow / totalSupply;

      let borrowApr: number | null = null;
      try {
        const marketParams = {
          loanToken: params[0],
          collateralToken: params[1],
          oracle: params[2],
          irm: params[3],
          lltv: params[4],
        };
        const marketState = {
          totalSupplyAssets: state[0],
          totalSupplyShares: state[1],
          totalBorrowAssets: state[2],
          totalBorrowShares: state[3],
          lastUpdate: state[4],
          fee: state[5],
        };
        const rate = await publicClient.readContract({
          address: morpho.adaptiveCurveIrm.address as `0x${string}`,
          abi: irmAbi,
          functionName: "borrowRateView",
          args: [marketParams, marketState],
        });
        borrowApr = ratePerSecondToApr(rate);
      } catch {
        borrowApr = null;
      }

      return {
        ...base,
        status: "live" as const,
        totalSupplyUsd: totalSupply,
        totalBorrowUsd: totalBorrow,
        liquidityUsd: Math.max(0, totalSupply - totalBorrow),
        utilization,
        borrowApr,
        // Suppliers earn the borrow rate scaled by utilization; the vault fee is 0 for the MVP.
        supplyApr: borrowApr === null ? null : borrowApr * utilization,
      };
    }),
  );
}

export type VaultView = {
  name: string;
  symbol: string;
  asset: string;
  status: MarketStatus;
  address: `0x${string}` | null;
  performanceFee: number;
  totalAssetsUsd: number;
  withdrawableUsd: number;
  apy: number | null;
  markets: string[];
};

export async function getVaults(): Promise<VaultView[]> {
  const markets = await getMarkets();
  const live = markets.filter((m) => m.status === "live");
  const totalSupply = live.reduce((a, m) => a + m.totalSupplyUsd, 0);
  const withdrawable = live.reduce((a, m) => a + m.liquidityUsd, 0);
  const weightedApy =
    totalSupply === 0
      ? null
      : live.reduce((a, m) => a + (m.supplyApr ?? 0) * m.totalSupplyUsd, 0) / totalSupply;

  return [
    {
      name: vaultConfig.name,
      symbol: vaultConfig.symbol,
      asset: vaultConfig.asset,
      status: live.length > 0 ? "live" : "pending",
      address: null,
      performanceFee: Number(vaultConfig.performanceFeeWad) / 1e18,
      totalAssetsUsd: totalSupply,
      withdrawableUsd: withdrawable,
      apy: weightedApy,
      markets: markets.map((m) => m.symbol),
    },
  ];
}

export async function getProtocolStats() {
  const markets = await getMarkets();
  const totalSupplyUsd = markets.reduce((a, m) => a + m.totalSupplyUsd, 0);
  const totalBorrowUsd = markets.reduce((a, m) => a + m.totalBorrowUsd, 0);
  return {
    chainId: 4663,
    totalSupplyUsd,
    totalBorrowUsd,
    liquidityUsd: totalSupplyUsd - totalBorrowUsd,
    marketCount: markets.length,
    liveMarketCount: markets.filter((m) => m.status === "live").length,
    capUsd: markets.reduce((a, m) => a + m.supplyCapUsd, 0),
    lltvTiers: {
      stock: Number(LLTV.stock) / 1e18,
      eth: Number(LLTV.eth) / 1e18,
      longTail: Number(LLTV.longTail) / 1e18,
    },
    contracts: {
      morphoBlue: morpho.blue.address,
      irm: morpho.adaptiveCurveIrm.address,
      oracleFactory: morpho.chainlinkOracleV2Factory.address,
    },
  };
}
