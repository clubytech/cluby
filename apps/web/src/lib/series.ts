import { deployments } from "@cluby/config";

export type BuilderRow = { id: `0x${string}`; label: string | null; referredVolume: number; feeEarned: number };

/** Volume builders claim to have routed. Null when there is no indexer to ask. */
export async function getBuilders(): Promise<BuilderRow[] | null> {
  if (!INDEXER) return null;
  try {
    const r = await fetch(`${INDEXER}/builders`, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    const rows = (await r.json()) as { id: string; label: string | null; referredVolume: string; feeEarned: string }[];
    return rows.map((b) => ({
      id: b.id as `0x${string}`,
      label: b.label,
      referredVolume: Number(b.referredVolume) / 1e6,
      feeEarned: Number(b.feeEarned) / 1e6,
    }));
  } catch {
    return null;
  }
}

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
