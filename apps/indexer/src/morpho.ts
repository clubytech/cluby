import { ponder } from "ponder:registry";
import { market, position, txEvent, liquidation } from "ponder:schema";
import { marketCatalog, deployments } from "@cluby/config";
import { referrerFromCalldata } from "@cluby/sdk";
import { builder } from "ponder:schema";

/** Reverse the deploy record so an id can name itself in the API. */
const keyOf = (id: string) =>
  Object.entries(deployments.markets).find(([, m]) => m.id.toLowerCase() === id.toLowerCase())?.[0] ??
  marketCatalog.find((m) => m.key === id)?.key ??
  id;

const positionId = (marketId: string, user: string) => `${marketId}-${user.toLowerCase()}`;
const eventId = (hash: string, logIndex: number) => `${hash}-${logIndex}`;

/** A position row is created on first touch and updated in place after that. */
async function touchPosition(
  context: any,
  marketId: `0x${string}`,
  user: `0x${string}`,
  timestamp: number,
  patch: Partial<{ supplyShares: bigint; borrowShares: bigint; collateral: bigint; interestPaid: bigint }>,
  delta = true,
) {
  const id = positionId(marketId, user);
  const existing = await context.db.find(position, { id });
  if (!existing) {
    await context.db.insert(position).values({
      id,
      marketId,
      user,
      supplyShares: patch.supplyShares ?? 0n,
      borrowShares: patch.borrowShares ?? 0n,
      collateral: patch.collateral ?? 0n,
      interestPaid: patch.interestPaid ?? 0n,
      liquidatedCount: 0,
      openedAt: timestamp,
      updatedAt: timestamp,
    });
    return;
  }
  await context.db.update(position, { id }).set((row: any) => ({
    supplyShares: delta ? row.supplyShares + (patch.supplyShares ?? 0n) : (patch.supplyShares ?? row.supplyShares),
    borrowShares: delta ? row.borrowShares + (patch.borrowShares ?? 0n) : (patch.borrowShares ?? row.borrowShares),
    collateral: delta ? row.collateral + (patch.collateral ?? 0n) : (patch.collateral ?? row.collateral),
    interestPaid: row.interestPaid + (patch.interestPaid ?? 0n),
    updatedAt: timestamp,
  }));
}

async function bumpMarket(context: any, id: `0x${string}`, patch: Record<string, bigint | number>, timestamp: number) {
  const existing = await context.db.find(market, { id });
  if (!existing) return;
  await context.db.update(market, { id }).set((row: any) => {
    const next: Record<string, unknown> = { lastUpdate: timestamp };
    for (const [k, v] of Object.entries(patch)) {
      next[k] = typeof v === "bigint" ? (row[k] as bigint) + v : (row[k] as number) + v;
    }
    return next;
  });
}

ponder.on("MorphoBlue:CreateMarket", async ({ event, context }) => {
  const p = event.args.marketParams;
  await context.db.insert(market).values({
    id: event.args.id,
    key: keyOf(event.args.id),
    loanToken: p.loanToken,
    collateralToken: p.collateralToken,
    oracle: p.oracle,
    irm: p.irm,
    lltv: p.lltv,
    totalSupplyAssets: 0n,
    totalSupplyShares: 0n,
    totalBorrowAssets: 0n,
    totalBorrowShares: 0n,
    fee: 0n,
    lastUpdate: Number(event.block.timestamp),
    createdAt: Number(event.block.timestamp),
    interestAccrued: 0n,
    liquidationCount: 0,
    badDebtAssets: 0n,
  });
});

ponder.on("MorphoBlue:Supply", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await creditBuilder(context, event.transaction.input, event.args.assets, ts);
  await bumpMarket(context, event.args.id, { totalSupplyAssets: event.args.assets, totalSupplyShares: event.args.shares }, ts);
  await touchPosition(context, event.args.id, event.args.onBehalf, ts, { supplyShares: event.args.shares });
  await context.db.insert(txEvent).values({
    id: eventId(event.transaction.hash, event.log.logIndex),
    marketId: event.args.id,
    kind: "supply",
    user: event.args.onBehalf,
    caller: event.args.caller,
    assets: event.args.assets,
    shares: event.args.shares,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: ts,
  });
});

ponder.on("MorphoBlue:Withdraw", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await bumpMarket(context, event.args.id, { totalSupplyAssets: -event.args.assets, totalSupplyShares: -event.args.shares }, ts);
  await touchPosition(context, event.args.id, event.args.onBehalf, ts, { supplyShares: -event.args.shares });
  await context.db.insert(txEvent).values({
    id: eventId(event.transaction.hash, event.log.logIndex),
    marketId: event.args.id,
    kind: "withdraw",
    user: event.args.onBehalf,
    caller: event.args.caller,
    assets: event.args.assets,
    shares: event.args.shares,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: ts,
  });
});

/**
 * Credit a builder for volume they routed. The address rides along as a calldata suffix, so this is
 * a claim rather than a proof — payouts are decided against the registered list, off chain.
 */
async function creditBuilder(context: any, input: `0x${string}`, volume: bigint, ts: number) {
  const referrer = referrerFromCalldata(input);
  if (!referrer || volume === 0n) return;

  const existing = await context.db.find(builder, { id: referrer });
  if (!existing) {
    await context.db.insert(builder).values({
      id: referrer,
      label: null,
      referredVolume: volume,
      feeEarned: 0n,
      updatedAt: ts,
    });
    return;
  }
  await context.db.update(builder, { id: referrer }).set((row: any) => ({
    referredVolume: row.referredVolume + volume,
    updatedAt: ts,
  }));
}

ponder.on("MorphoBlue:Borrow", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await creditBuilder(context, event.transaction.input, event.args.assets, ts);
  await bumpMarket(context, event.args.id, { totalBorrowAssets: event.args.assets, totalBorrowShares: event.args.shares }, ts);
  await touchPosition(context, event.args.id, event.args.onBehalf, ts, { borrowShares: event.args.shares });
  await context.db.insert(txEvent).values({
    id: eventId(event.transaction.hash, event.log.logIndex),
    marketId: event.args.id,
    kind: "borrow",
    user: event.args.onBehalf,
    caller: event.args.caller,
    assets: event.args.assets,
    shares: event.args.shares,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: ts,
  });
});

ponder.on("MorphoBlue:Repay", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await bumpMarket(context, event.args.id, { totalBorrowAssets: -event.args.assets, totalBorrowShares: -event.args.shares }, ts);
  await touchPosition(context, event.args.id, event.args.onBehalf, ts, { borrowShares: -event.args.shares });
  await context.db.insert(txEvent).values({
    id: eventId(event.transaction.hash, event.log.logIndex),
    marketId: event.args.id,
    kind: "repay",
    user: event.args.onBehalf,
    caller: event.args.caller,
    assets: event.args.assets,
    shares: event.args.shares,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: ts,
  });
});

ponder.on("MorphoBlue:SupplyCollateral", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await touchPosition(context, event.args.id, event.args.onBehalf, ts, { collateral: event.args.assets });
  await context.db.insert(txEvent).values({
    id: eventId(event.transaction.hash, event.log.logIndex),
    marketId: event.args.id,
    kind: "supplyCollateral",
    user: event.args.onBehalf,
    caller: event.args.caller,
    assets: event.args.assets,
    shares: 0n,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: ts,
  });
});

ponder.on("MorphoBlue:WithdrawCollateral", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await touchPosition(context, event.args.id, event.args.onBehalf, ts, { collateral: -event.args.assets });
  await context.db.insert(txEvent).values({
    id: eventId(event.transaction.hash, event.log.logIndex),
    marketId: event.args.id,
    kind: "withdrawCollateral",
    user: event.args.onBehalf,
    caller: event.args.caller,
    assets: event.args.assets,
    shares: 0n,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    timestamp: ts,
  });
});

ponder.on("MorphoBlue:Liquidate", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  const keeper = (process.env.KEEPER_ADDRESS ?? "").toLowerCase();
  await context.db.insert(liquidation).values({
    id: eventId(event.transaction.hash, event.log.logIndex),
    marketId: event.args.id,
    borrower: event.args.borrower,
    liquidator: event.args.caller,
    repaidAssets: event.args.repaidAssets,
    seizedAssets: event.args.seizedAssets,
    badDebtAssets: event.args.badDebtAssets,
    byKeeper: keeper !== "" && event.args.caller.toLowerCase() === keeper,
    txHash: event.transaction.hash,
    timestamp: ts,
  });
  await bumpMarket(
    context,
    event.args.id,
    {
      totalBorrowAssets: -event.args.repaidAssets,
      totalBorrowShares: -event.args.repaidShares,
      badDebtAssets: event.args.badDebtAssets,
      liquidationCount: 1,
    },
    ts,
  );
  const id = positionId(event.args.id, event.args.borrower);
  const existing = await context.db.find(position, { id });
  if (existing) {
    await context.db.update(position, { id }).set((row: any) => ({
      borrowShares: row.borrowShares - event.args.repaidShares,
      collateral: row.collateral - event.args.seizedAssets,
      liquidatedCount: row.liquidatedCount + 1,
      updatedAt: ts,
    }));
  }
});

/**
 * Interest is where the borrower's cost and the vault's fee both come from, so it is recorded on
 * the market rather than inferred later from rate times time.
 */
ponder.on("MorphoBlue:AccrueInterest", async ({ event, context }) => {
  await bumpMarket(
    context,
    event.args.id,
    { totalBorrowAssets: event.args.interest, totalSupplyAssets: event.args.interest, interestAccrued: event.args.interest },
    Number(event.block.timestamp),
  );
});
