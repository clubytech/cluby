import { creditScore } from "ponder:schema";

/**
 * Credit score, 0–1000, from what the indexer already sees.
 *
 * The score changes what a borrower is PAID — their share of the rebate — and never what they may
 * BORROW. LTV is what protects the lenders, and a number computed off chain must not be able to
 * move it: the worst a wrong score can do is misallocate a rebate.
 *
 * Deliberately simple and public. A rule nobody can read is a rule nobody can trust, and one that
 * is easy to game with wash volume is worse than none — so the cheapest signal, size, is worth the
 * least, and the expensive ones, time and interest actually paid, are worth the most. A liquidation
 * costs a quarter of the range, because it is the one event that costs the protocol money.
 */
export function computeScore(input: {
  daysActive: number;
  interestPaid: bigint;
  borrowVolume: bigint;
  liquidations: number;
}): number {
  let score = 500;
  score += Math.min(200, Math.round(input.daysActive * 4)); // fifty days reaches the cap
  score += Math.min(200, Math.round((Number(input.interestPaid) / 1e6 / 1_000) * 200)); // $1k of interest
  score += Math.min(100, Math.round((Number(input.borrowVolume) / 1e6 / 50_000) * 100)); // $50k borrowed
  score -= input.liquidations * 250;
  return Math.max(0, Math.min(1000, score));
}

type Delta = { borrowed?: bigint; repaid?: bigint; liquidated?: boolean };

/** Record what happened, then recompute. Called from the Morpho handlers. */
export async function recordAndScore(context: any, user: `0x${string}`, ts: number, delta: Delta) {
  const existing = await context.db.find(creditScore, { id: user });

  if (!existing) {
    const borrowVolume = delta.borrowed ?? 0n;
    const repaidVolume = delta.repaid ?? 0n;
    await context.db.insert(creditScore).values({
      id: user,
      score: computeScore({ daysActive: 0, interestPaid: 0n, borrowVolume, liquidations: delta.liquidated ? 1 : 0 }),
      borrowVolume,
      repaidVolume,
      liquidations: delta.liquidated ? 1 : 0,
      firstSeenAt: ts,
      updatedAt: ts,
    });
    return;
  }

  // The row comes back loosely typed from the store; pin the numeric types here so the arithmetic
  // below cannot silently mix a number into a bigint.
  const borrowVolume: bigint = BigInt(existing.borrowVolume) + (delta.borrowed ?? 0n);
  const repaidVolume: bigint = BigInt(existing.repaidVolume) + (delta.repaid ?? 0n);
  const liquidations: number = Number(existing.liquidations) + (delta.liquidated ? 1 : 0);
  // Interest paid is what came back beyond what went out. Negative means the loan is still open,
  // which is not a debt to the borrower's name — it floors at zero.
  const interestPaid: bigint = repaidVolume > borrowVolume ? repaidVolume - borrowVolume : 0n;
  const daysActive: number = Math.floor((ts - Number(existing.firstSeenAt)) / 86_400);

  await context.db.update(creditScore, { id: user }).set({
    score: computeScore({ daysActive, interestPaid, borrowVolume, liquidations }),
    borrowVolume,
    repaidVolume,
    liquidations,
    updatedAt: ts,
  });
}
