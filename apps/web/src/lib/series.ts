import { deployments } from "@cluby/config";

export type Snapshot = {
  timestamp: number;
  supplyAssets: number;
  borrowAssets: number;
  utilization: number;
  borrowApy: number;
  price: number;
};

const INDEXER = process.env.CLUBY_INDEXER_URL ?? "";
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/**
 * History for one market, from the indexer.
 *
 * Returns null — not an empty array — when there is no indexer to ask. The page then says the
 * history is unavailable instead of drawing an empty chart, which would read as "nothing happened".
 */
export async function getMarketSeries(marketKey: string, sinceUnix = 0): Promise<Snapshot[] | null> {
  const id = deployments.markets[marketKey]?.id;
  if (!INDEXER || !id) return null;

  try {
    const r = await fetch(`${INDEXER}/market/${id}/series?since=${sinceUnix}`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as {
      timestamp: number;
      supplyAssets: string;
      borrowAssets: string;
      utilizationBps: number;
      borrowRatePerSecond: string;
      price: string;
    }[];

    return rows.map((row) => ({
      timestamp: row.timestamp,
      supplyAssets: Number(row.supplyAssets) / 1e6,
      borrowAssets: Number(row.borrowAssets) / 1e6,
      utilization: row.utilizationBps / 10_000,
      // Per-second rate compounded the way Morpho accrues it.
      borrowApy: Math.expm1((Number(row.borrowRatePerSecond) / 1e18) * SECONDS_PER_YEAR),
      price: Number(row.price) / 1e24,
    }));
  } catch {
    return null;
  }
}
