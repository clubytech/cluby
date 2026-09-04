/**
 * The maths the UI must agree with on chain. Mirrors what Lens returns from Morpho, so a preview
 * and the transaction that follows it cannot disagree (PLAN §1.5, §4).
 */

/** collateralValue · LLTV / debt. Above 1 the position is safe; at 1 it is liquidatable. */
export function healthFactor(collateralValueUsd: number, debtUsd: number, lltv: number): number | null {
  if (debtUsd <= 0) return null;
  if (collateralValueUsd <= 0) return 0;
  return (collateralValueUsd * lltv) / debtUsd;
}

/** The collateral price at which the position touches LLTV. */
export function liquidationPrice(
  collateralUnits: number,
  debtUsd: number,
  lltv: number,
  currentPrice: number,
): number | null {
  if (collateralUnits <= 0 || debtUsd <= 0) return null;
  const price = debtUsd / (collateralUnits * lltv);
  return Math.min(price, currentPrice * 10);
}

/** Highest leverage an LTV allows: 1 / (1 − LTV). */
export function maxLeverage(ltv: number): number {
  return ltv >= 1 ? Infinity : 1 / (1 - ltv);
}

/**
 * A Multiply position: start with `equityUsd`, flash-loan the difference, end at `leverage`×
 * exposure with the borrowed amount as debt.
 */
export function leveragePlan(equityUsd: number, leverage: number, lltv: number) {
  const exposure = equityUsd * leverage;
  const debt = Math.max(0, exposure - equityUsd);
  const ltv = exposure === 0 ? 0 : debt / exposure;
  return {
    exposure,
    debt,
    ltv,
    hf: healthFactor(exposure, debt, lltv),
    /** Fraction of today's price at which this position liquidates. */
    liquidationDrop: exposure === 0 ? 0 : debt / (exposure * lltv),
  };
}
