import { ORACLE_PRICE_SCALE, WAD } from "@cluby/config";

/**
 * Morpho's share accounting. Virtual shares and assets make the first deposit non-exploitable;
 * getting them wrong is how a UI ends up one wei off the contract on every position.
 */
export const VIRTUAL_SHARES = 1_000_000n;
export const VIRTUAL_ASSETS = 1n;

const mulDivDown = (x: bigint, y: bigint, d: bigint) => (x * y) / d;
const mulDivUp = (x: bigint, y: bigint, d: bigint) => (x * y + (d - 1n)) / d;

export const toAssetsDown = (shares: bigint, totalAssets: bigint, totalShares: bigint) =>
  mulDivDown(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);

export const toAssetsUp = (shares: bigint, totalAssets: bigint, totalShares: bigint) =>
  mulDivUp(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);

export const toSharesDown = (assets: bigint, totalAssets: bigint, totalShares: bigint) =>
  mulDivDown(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS);

export const toSharesUp = (assets: bigint, totalAssets: bigint, totalShares: bigint) =>
  mulDivUp(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS);

/**
 * Value of collateral in loan-token units, using Morpho's oracle convention:
 * `price` is the collateral price quoted in loan tokens, scaled by 1e36.
 */
export const collateralValue = (collateral: bigint, oraclePrice: bigint) =>
  mulDivDown(collateral, oraclePrice, ORACLE_PRICE_SCALE);

/** The most that may be borrowed against this collateral at this LLTV. */
export const maxBorrow = (collateral: bigint, oraclePrice: bigint, lltv: bigint) =>
  mulDivDown(collateralValue(collateral, oraclePrice), lltv, WAD);

/**
 * Health factor in WAD. At or below 1e18 the position is liquidatable.
 * Returns null for a position with no debt, which has no meaningful health factor.
 */
export function healthFactorWad(
  collateral: bigint,
  borrowed: bigint,
  oraclePrice: bigint,
  lltv: bigint,
): bigint | null {
  if (borrowed === 0n) return null;
  return mulDivDown(maxBorrow(collateral, oraclePrice, lltv), WAD, borrowed);
}

/** Oracle price (1e36) at which the position touches LLTV. */
export function liquidationPriceWad(collateral: bigint, borrowed: bigint, lltv: bigint): bigint | null {
  if (collateral === 0n || borrowed === 0n) return null;
  return mulDivUp(borrowed, ORACLE_PRICE_SCALE * WAD, collateral * lltv);
}

/** Highest borrow the app offers: LLTV minus the safety margin, in percentage points. */
export function safeBorrow(
  collateral: bigint,
  oraclePrice: bigint,
  lltv: bigint,
  marginPp: number,
): bigint {
  const margin = BigInt(Math.round(marginPp * 1e16)); // pp → WAD
  const safeLltv = lltv > margin ? lltv - margin : 0n;
  return mulDivDown(collateralValue(collateral, oraclePrice), safeLltv, WAD);
}

export const maxLeverage = (ltvWad: bigint) =>
  ltvWad >= WAD ? Infinity : Number(WAD) / Number(WAD - ltvWad);

/** Per-second rate (WAD) to a compounded annual figure, the way Morpho actually accrues. */
export const rateToApy = (ratePerSecondWad: bigint) =>
  Math.expm1((Number(ratePerSecondWad) / 1e18) * 365 * 24 * 60 * 60);

/**
 * A Multiply position: put up `equity`, end holding `leverage`× exposure with the rest borrowed.
 * `flashLoan` is what the router borrows for the single transaction.
 */
export function leveragePlan(equity: bigint, leverage: number, lltv: bigint) {
  const scaled = BigInt(Math.round(leverage * 1e6));
  const exposure = (equity * scaled) / 1_000_000n;
  const debt = exposure > equity ? exposure - equity : 0n;
  const ltv = exposure === 0n ? 0n : mulDivDown(debt, WAD, exposure);
  return {
    exposure,
    debt,
    flashLoan: debt,
    ltvWad: ltv,
    /** Fraction of today's price where this liquidates, in WAD. */
    liquidationDropWad: exposure === 0n ? 0n : mulDivDown(debt, WAD * WAD, exposure * lltv),
    healthFactorWad: exposure === 0n ? null : healthFactorWad(exposure, debt, ORACLE_PRICE_SCALE, lltv),
  };
}

/** Number helpers for display; the contract path stays in bigint. */
export const wadToNumber = (v: bigint) => Number(v) / 1e18;
export const fromUnits = (v: bigint, decimals: number) => Number(v) / 10 ** decimals;
export const toUnits = (v: number, decimals: number) => BigInt(Math.round(v * 10 ** decimals));
