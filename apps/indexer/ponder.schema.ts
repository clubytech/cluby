import { onchainTable, index } from "ponder";

/** One row per Cluby market, kept level with Morpho Blue's own accounting. */
export const market = onchainTable("market", (t) => ({
  id: t.hex().primaryKey(),
  key: t.text().notNull(),
  loanToken: t.hex().notNull(),
  collateralToken: t.hex().notNull(),
  oracle: t.hex().notNull(),
  irm: t.hex().notNull(),
  lltv: t.bigint().notNull(),
  totalSupplyAssets: t.bigint().notNull(),
  totalSupplyShares: t.bigint().notNull(),
  totalBorrowAssets: t.bigint().notNull(),
  totalBorrowShares: t.bigint().notNull(),
  fee: t.bigint().notNull(),
  lastUpdate: t.integer().notNull(),
  createdAt: t.integer().notNull(),
  /** Cumulative interest paid by borrowers, for the rebate epochs. */
  interestAccrued: t.bigint().notNull(),
  liquidationCount: t.integer().notNull(),
  badDebtAssets: t.bigint().notNull(),
}));

export const vault = onchainTable("vault", (t) => ({
  id: t.hex().primaryKey(),
  key: t.text().notNull(),
  asset: t.hex().notNull(),
  totalAssets: t.bigint().notNull(),
  totalShares: t.bigint().notNull(),
  feeShares: t.bigint().notNull(),
  depositorCount: t.integer().notNull(),
  updatedAt: t.integer().notNull(),
}));

/** How much of a vault sits in each market, and the cap it may not exceed. */
export const vaultAllocation = onchainTable(
  "vault_allocation",
  (t) => ({
    id: t.text().primaryKey(), // `${vault}-${marketId}`
    vault: t.hex().notNull(),
    marketId: t.hex().notNull(),
    cap: t.bigint().notNull(),
    supplied: t.bigint().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (tbl) => ({ byVault: index().on(tbl.vault) }),
);

export const position = onchainTable(
  "position",
  (t) => ({
    id: t.text().primaryKey(), // `${marketId}-${user}`
    marketId: t.hex().notNull(),
    user: t.hex().notNull(),
    supplyShares: t.bigint().notNull(),
    borrowShares: t.bigint().notNull(),
    collateral: t.bigint().notNull(),
    /** Interest this borrower has paid, the basis of the rebate. */
    interestPaid: t.bigint().notNull(),
    liquidatedCount: t.integer().notNull(),
    openedAt: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (tbl) => ({ byMarket: index().on(tbl.marketId), byUser: index().on(tbl.user) }),
);

export const txEvent = onchainTable(
  "tx_event",
  (t) => ({
    id: t.text().primaryKey(), // `${txHash}-${logIndex}`
    marketId: t.hex().notNull(),
    kind: t.text().notNull(),
    user: t.hex().notNull(),
    caller: t.hex().notNull(),
    assets: t.bigint().notNull(),
    shares: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (tbl) => ({ byMarket: index().on(tbl.marketId), byUser: index().on(tbl.user) }),
);

export const liquidation = onchainTable(
  "liquidation",
  (t) => ({
    id: t.text().primaryKey(),
    marketId: t.hex().notNull(),
    borrower: t.hex().notNull(),
    liquidator: t.hex().notNull(),
    repaidAssets: t.bigint().notNull(),
    seizedAssets: t.bigint().notNull(),
    badDebtAssets: t.bigint().notNull(),
    /** True when our own keeper did it, which is how we measure whether it is working. */
    byKeeper: t.boolean().notNull(),
    txHash: t.hex().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (tbl) => ({ byMarket: index().on(tbl.marketId), byBorrower: index().on(tbl.borrower) }),
);

/** Five-minute series behind every chart on the site. */
export const snapshot = onchainTable(
  "snapshot",
  (t) => ({
    id: t.text().primaryKey(), // `${marketId}-${timestamp}`
    marketId: t.hex().notNull(),
    timestamp: t.integer().notNull(),
    supplyAssets: t.bigint().notNull(),
    borrowAssets: t.bigint().notNull(),
    utilizationBps: t.integer().notNull(),
    borrowRatePerSecond: t.bigint().notNull(),
    price: t.bigint().notNull(),
  }),
  (tbl) => ({ byMarket: index().on(tbl.marketId, tbl.timestamp) }),
);

/** Oracle watch: what the feed said versus what the pool said, so divergence is a query. */
export const feedTick = onchainTable(
  "feed_tick",
  (t) => ({
    id: t.text().primaryKey(),
    symbol: t.text().notNull(),
    timestamp: t.integer().notNull(),
    feedPrice: t.bigint().notNull(),
    twapPrice: t.bigint().notNull(),
    divergenceBps: t.integer().notNull(),
  }),
  (tbl) => ({ bySymbol: index().on(tbl.symbol, tbl.timestamp) }),
);

export const creditScore = onchainTable("credit_score", (t) => ({
  id: t.hex().primaryKey(), // user
  score: t.integer().notNull(),
  borrowVolume: t.bigint().notNull(),
  interestPaid: t.bigint().notNull(),
  liquidations: t.integer().notNull(),
  daysActive: t.integer().notNull(),
  updatedAt: t.integer().notNull(),
}));

export const rebateEpoch = onchainTable("rebate_epoch", (t) => ({
  id: t.text().primaryKey(), // epoch number
  epoch: t.integer().notNull(),
  root: t.hex(),
  totalRebate: t.bigint().notNull(),
  claimedRebate: t.bigint().notNull(),
  startedAt: t.integer().notNull(),
  endedAt: t.integer(),
}));

/**
 * Season One points: size multiplied by time, accumulated per user.
 *
 * Stored as "unit-seconds" rather than a score, because the accrual is continuous and the position
 * only moves when someone touches it. The API adds the time since the last touch on read, so a
 * user who does nothing for a month still sees their points grow — and nothing has to walk every
 * account on a timer to make that true.
 */
export const points = onchainTable("points", (t) => ({
  id: t.hex().primaryKey(), // user
  supplyUnitSeconds: t.bigint().notNull(),
  borrowUnitSeconds: t.bigint().notNull(),
  /** Sizes at the last touch, so the API can extrapolate from here. */
  supplyAssets: t.bigint().notNull(),
  borrowAssets: t.bigint().notNull(),
  updatedAt: t.integer().notNull(),
}));

export const builder = onchainTable("builder", (t) => ({
  id: t.hex().primaryKey(),
  label: t.text(),
  referredVolume: t.bigint().notNull(),
  feeEarned: t.bigint().notNull(),
  updatedAt: t.integer().notNull(),
}));
