import { ponder } from "ponder:registry";
import { market, feedTick, stockToken, snapshot } from "ponder:schema";
import { lensAbi, stockTokenAbi } from "@cluby/abi";
import { stocks } from "@cluby/config";

const LENS = process.env.LENS_ADDR as `0x${string}`;
const symbolOf = (addr: string) =>
  Object.entries(stocks).find(([, s]) => s.address.toLowerCase() === addr.toLowerCase())?.[0] ?? "?";

ponder.on("Feed:AnswerUpdated", async ({ event, context }) => {
  await context.db.insert(feedTick).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    aggregator: event.log.address,
    answer: event.args.current,
    updatedAt: Number(event.args.updatedAt),
  });
});

/** Every ~5 minutes: refresh stock token facts and write a snapshot per market via Lens. */
ponder.on("Snapshot:block", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  const markets = await context.db.sql.select().from(market);
  for (const m of markets) {
    let v: any;
    try {
      v = await context.client.readContract({ abi: lensAbi, address: LENS, functionName: "marketView", args: [m.id] });
    } catch {
      continue;
    }
    const [supply, mult, paused] = await Promise.all([
      context.client.readContract({ abi: stockTokenAbi, address: m.stock, functionName: "totalSupply" }),
      context.client.readContract({ abi: stockTokenAbi, address: m.stock, functionName: "uiMultiplier" }).catch(() => 10n ** 18n),
      context.client.readContract({ abi: stockTokenAbi, address: m.stock, functionName: "oraclePaused" }).catch(() => false),
    ]);
    await context.db
      .insert(stockToken)
      .values({ address: m.stock, symbol: symbolOf(m.stock), totalSupply: supply, uiMultiplier: mult, oraclePaused: paused, updatedAt: ts })
      .onConflictDoUpdate({ totalSupply: supply, uiMultiplier: mult, oraclePaused: paused, updatedAt: ts });

    const s = v.state;
    const borrow = BigInt(s.totalBorrowAssets);
    const siBps = supply > 0n ? Number((borrow * 10_000n) / supply) : 0;
    const feed = BigInt(v.quote.feedPrice);
    const twap = BigInt(v.quote.twapPrice);
    const premiumBps = feed > 0n && twap > 0n ? Number((twap * 10_000n) / feed) - 10_000 : 0;
    const util = BigInt(v.utilizationWad);
    const apr = BigInt(v.borrowAprWad);
    await context.db.insert(snapshot).values({
      id: `${m.id}-${event.block.number}`,
      marketId: m.id,
      blockNumber: event.block.number,
      ts,
      totalSupplyAssets: BigInt(s.totalSupplyAssets),
      totalBorrowAssets: borrow,
      utilizationWad: util,
      borrowAprWad: apr,
      supplyAprWad: BigInt(v.supplyAprWad),
      price: BigInt(v.price),
      feedPrice: feed,
      twapPrice: twap,
      weekendMode: v.weekendMode,
      float: supply,
      shortInterestBps: siBps,
      premiumBps,
      hardToBorrow: util > 8n * 10n ** 17n || apr > 5n * 10n ** 17n,
    });
    await context.db.update(market, { id: m.id }).set({
      totalSupplyAssets: BigInt(s.totalSupplyAssets),
      totalBorrowAssets: borrow,
      totalSupplyShares: BigInt(s.totalSupplyShares),
      totalBorrowShares: BigInt(s.totalBorrowShares),
    });
  }
});
