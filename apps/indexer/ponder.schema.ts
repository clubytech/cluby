import { onchainTable, index } from "ponder";

export const market = onchainTable("market", (t) => ({
  id: t.hex().primaryKey(),
  stock: t.hex().notNull(),
  symbol: t.text().notNull(),
  collateral: t.hex().notNull(),
  oracle: t.hex().notNull(),
  irm: t.hex().notNull(),
  initialMarginBps: t.integer().notNull(),
  liqThresholdBps: t.integer().notNull(),
  liqBonusBps: t.integer().notNull(),
  borrowCap: t.bigint().notNull(),
  flags: t.integer().notNull(),
  feeBps: t.integer().notNull(),
  totalSupplyAssets: t.bigint().notNull(),
  totalSupplyShares: t.bigint().notNull(),
  totalBorrowAssets: t.bigint().notNull(),
  totalBorrowShares: t.bigint().notNull(),
  lastUpdate: t.integer().notNull(),
  createdAt: t.integer().notNull(),
}));

export const position = onchainTable(
  "position",
  (t) => ({
    id: t.text().primaryKey(), // `${marketId}-${user}`
    marketId: t.hex().notNull(),
    user: t.hex().notNull(),
    supplyShares: t.bigint().notNull(),
    borrowShares: t.bigint().notNull(),
    collateral: t.bigint().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (tbl) => ({ byMarket: index().on(tbl.marketId), byUser: index().on(tbl.user) }),
);

export const txEvent = onchainTable(
  "tx_event",
  (t) => ({
    id: t.text().primaryKey(), // `${txHash}-${logIndex}`
    marketId: t.hex().notNull(),
    kind: t.text().notNull(), // supply|withdraw|supplyCollateral|withdrawCollateral|borrow|repay|liquidate
    user: t.hex().notNull(),
    caller: t.hex().notNull(),
    assets: t.bigint().notNull(),
    shares: t.bigint().notNull(),
    collateral: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    ts: t.integer().notNull(),
  }),
  (tbl) => ({ byMarket: index().on(tbl.marketId), byUser: index().on(tbl.user) }),
);

export const liquidation = onchainTable("liquidation", (t) => ({
  id: t.text().primaryKey(),
  marketId: t.hex().notNull(),
  borrower: t.hex().notNull(),
  liquidator: t.hex().notNull(),
  repaidAssets: t.bigint().notNull(),
  repaidShares: t.bigint().notNull(),
  seizedCollateral: t.bigint().notNull(),
  badDebtAssets: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  ts: t.integer().notNull(),
}));

export const accrual = onchainTable("accrual", (t) => ({
  id: t.text().primaryKey(),
  marketId: t.hex().notNull(),
  borrowRate: t.bigint().notNull(), // per-second WAD
  interest: t.bigint().notNull(),
  feeShares: t.bigint().notNull(),
  ts: t.integer().notNull(),
}));

export const feedTick = onchainTable(
  "feed_tick",
  (t) => ({
    id: t.text().primaryKey(),
    aggregator: t.hex().notNull(),
    answer: t.bigint().notNull(), // 8 decimals
    updatedAt: t.integer().notNull(),
  }),
  (tbl) => ({ byAgg: index().on(tbl.aggregator) }),
);

export const stockToken = onchainTable("stock_token", (t) => ({
  address: t.hex().primaryKey(),
  symbol: t.text().notNull(),
  totalSupply: t.bigint().notNull(),
  uiMultiplier: t.bigint().notNull(),
  oraclePaused: t.boolean().notNull(),
  updatedAt: t.integer().notNull(),
}));

/** Periodic market snapshot: what the board and charts read. */
export const snapshot = onchainTable(
  "snapshot",
  (t) => ({
    id: t.text().primaryKey(), // `${marketId}-${blockNumber}`
    marketId: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    ts: t.integer().notNull(),
    totalSupplyAssets: t.bigint().notNull(),
    totalBorrowAssets: t.bigint().notNull(),
    utilizationWad: t.bigint().notNull(),
    borrowAprWad: t.bigint().notNull(),
    supplyAprWad: t.bigint().notNull(),
    price: t.bigint().notNull(), // 1e36
    feedPrice: t.bigint().notNull(),
    twapPrice: t.bigint().notNull(),
    weekendMode: t.boolean().notNull(),
    float: t.bigint().notNull(), // stock totalSupply
    shortInterestBps: t.integer().notNull(), // totalBorrow / float
    premiumBps: t.integer().notNull(), // twap/feed - 1
    hardToBorrow: t.boolean().notNull(), // utilization > 80% or apr > 50%
  }),
  (tbl) => ({ byMarket: index().on(tbl.marketId, tbl.ts) }),
);
