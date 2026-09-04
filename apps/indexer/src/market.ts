import { ponder } from "ponder:registry";
import { market, position, txEvent, liquidation, accrual } from "ponder:schema";
import { marketAbi } from "@cluby/abi";
import { stocks } from "@cluby/config";

const symbolOf = (addr: string) =>
  Object.entries(stocks).find(([, s]) => s.address.toLowerCase() === addr.toLowerCase())?.[0] ?? "?";

const posId = (m: string, u: string) => `${m}-${u.toLowerCase()}`;

async function refreshMarket(context: any, id: `0x${string}`, ts: number) {
  const s = await context.client.readContract({ abi: marketAbi, address: process.env.MARKET_ADDR, functionName: "state", args: [id] });
  const r = await context.client.readContract({ abi: marketAbi, address: process.env.MARKET_ADDR, functionName: "risk", args: [id] });
  await context.db.update(market, { id }).set({
    totalSupplyAssets: s.totalSupplyAssets,
    totalSupplyShares: s.totalSupplyShares,
    totalBorrowAssets: s.totalBorrowAssets,
    totalBorrowShares: s.totalBorrowShares,
    lastUpdate: Number(s.lastUpdate),
    feeBps: s.feeBps,
    initialMarginBps: r.initialMarginBps,
    liqThresholdBps: r.liqThresholdBps,
    liqBonusBps: r.liqBonusBps,
    borrowCap: r.borrowCap,
    flags: r.flags,
  });
  return ts;
}

async function refreshPosition(context: any, id: `0x${string}`, user: `0x${string}`, ts: number) {
  const p = await context.client.readContract({ abi: marketAbi, address: process.env.MARKET_ADDR, functionName: "position", args: [id, user] });
  await context.db
    .insert(position)
    .values({ id: posId(id, user), marketId: id, user, supplyShares: p.supplyShares, borrowShares: p.borrowShares, collateral: p.collateral, updatedAt: ts })
    .onConflictDoUpdate({ supplyShares: p.supplyShares, borrowShares: p.borrowShares, collateral: p.collateral, updatedAt: ts });
}

async function logEvent(context: any, event: any, kind: string, user: string, assets = 0n, shares = 0n, collateral = 0n) {
  await context.db.insert(txEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    marketId: event.args.id,
    kind,
    user,
    caller: event.transaction.from,
    assets,
    shares,
    collateral,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    ts: Number(event.block.timestamp),
  });
}

ponder.on("Market:MarketCreated", async ({ event, context }) => {
  const { id, params, risk } = event.args;
  await context.db.insert(market).values({
    id,
    stock: params.stock,
    symbol: symbolOf(params.stock),
    collateral: params.collateral,
    oracle: params.oracle,
    irm: params.irm,
    initialMarginBps: risk.initialMarginBps,
    liqThresholdBps: risk.liqThresholdBps,
    liqBonusBps: risk.liqBonusBps,
    borrowCap: risk.borrowCap,
    flags: risk.flags,
    feeBps: 0,
    totalSupplyAssets: 0n,
    totalSupplyShares: 0n,
    totalBorrowAssets: 0n,
    totalBorrowShares: 0n,
    lastUpdate: Number(event.block.timestamp),
    createdAt: Number(event.block.timestamp),
  });
});

ponder.on("Market:Supply", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await logEvent(context, event, "supply", event.args.onBehalf, event.args.assets, event.args.shares);
  await refreshPosition(context, event.args.id, event.args.onBehalf, ts);
  await refreshMarket(context, event.args.id, ts);
});

ponder.on("Market:Withdraw", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await logEvent(context, event, "withdraw", event.args.onBehalf, event.args.assets, event.args.shares);
  await refreshPosition(context, event.args.id, event.args.onBehalf, ts);
  await refreshMarket(context, event.args.id, ts);
});

ponder.on("Market:SupplyCollateral", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await logEvent(context, event, "supplyCollateral", event.args.onBehalf, 0n, 0n, event.args.amount);
  await refreshPosition(context, event.args.id, event.args.onBehalf, ts);
});

ponder.on("Market:WithdrawCollateral", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await logEvent(context, event, "withdrawCollateral", event.args.onBehalf, 0n, 0n, event.args.amount);
  await refreshPosition(context, event.args.id, event.args.onBehalf, ts);
});

ponder.on("Market:Borrow", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await logEvent(context, event, "borrow", event.args.onBehalf, event.args.assets, event.args.shares);
  await refreshPosition(context, event.args.id, event.args.onBehalf, ts);
  await refreshMarket(context, event.args.id, ts);
});

ponder.on("Market:Repay", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await logEvent(context, event, "repay", event.args.onBehalf, event.args.assets, event.args.shares);
  await refreshPosition(context, event.args.id, event.args.onBehalf, ts);
  await refreshMarket(context, event.args.id, ts);
});

ponder.on("Market:Liquidate", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  const a = event.args;
  await context.db.insert(liquidation).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    marketId: a.id,
    borrower: a.borrower,
    liquidator: a.liquidator,
    repaidAssets: a.repaidAssets,
    repaidShares: a.repaidShares,
    seizedCollateral: a.seizedCollateral,
    badDebtAssets: a.badDebtAssets,
    txHash: event.transaction.hash,
    ts,
  });
  await logEvent(context, event, "liquidate", a.borrower, a.repaidAssets, a.repaidShares, a.seizedCollateral);
  await refreshPosition(context, a.id, a.borrower, ts);
  await refreshMarket(context, a.id, ts);
});

ponder.on("Market:AccrueInterest", async ({ event, context }) => {
  if (event.args.interest === 0n) return;
  await context.db.insert(accrual).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    marketId: event.args.id,
    borrowRate: event.args.borrowRate,
    interest: event.args.interest,
    feeShares: event.args.feeShares,
    ts: Number(event.block.timestamp),
  });
});

ponder.on("Market:RiskSet", async ({ event, context }) => {
  await refreshMarket(context, event.args.id, Number(event.block.timestamp));
});
ponder.on("Market:BorrowCapSet", async ({ event, context }) => {
  await context.db.update(market, { id: event.args.id }).set({ borrowCap: event.args.borrowCap });
});
ponder.on("Market:FlagsSet", async ({ event, context }) => {
  await context.db.update(market, { id: event.args.id }).set({ flags: event.args.flags });
});
ponder.on("Market:FeeSet", async ({ event, context }) => {
  await context.db.update(market, { id: event.args.id }).set({ feeBps: event.args.feeBps });
});
