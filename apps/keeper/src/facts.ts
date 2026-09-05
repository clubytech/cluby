import { marketCatalog, nativeTokens, stocks, tokens } from "@cluby/config";

/**
 * What the keeper needs to know about a market that is not on chain: how many decimals each side
 * carries, and which Uniswap fee tier its exit lives in.
 *
 * Both were being guessed before, and both guesses were wrong in the same place — on a short
 * market, where the collateral is USDG and the interesting token is the LOAN. A fee tier looked up
 * by collateral address found nothing there and fell back to 500, which is not the tier TSLA's pool
 * uses; a `formatUnits(x, 6)` on a short market's loan amount printed a number 1e12 too small, so
 * the operator read "liquidated 0.000000000112 USDG" for a real liquidation.
 */
export type MarketFacts = {
  loanDecimals: number;
  collateralDecimals: number;
  /** Fee tier of the pool the seized collateral is sold through. */
  poolFee: number;
};

/** Every tokenized stock on this chain is an 18-decimal ERC-20; USDG and WETH declare their own. */
const decimalsOf = (symbol: string): number =>
  symbol in tokens ? tokens[symbol as keyof typeof tokens].decimals : 18;

const poolFeeOf = (symbol: string): number | null => {
  if (symbol in stocks) return stocks[symbol as keyof typeof stocks].usdgPool.fee;
  if (symbol in nativeTokens) return nativeTokens[symbol as keyof typeof nativeTokens].usdgPool.fee;
  return null;
};

const DEFAULT_POOL_FEE = 500;

const byKey = new Map<string, MarketFacts>(
  marketCatalog.map((m) => {
    // The swap always goes collateral → loan, and exactly one of the two is USDG. The pool is the
    // other one's USDG pool, whichever side of the market it sits on.
    const fee = poolFeeOf(m.collateral) ?? poolFeeOf(m.loan) ?? DEFAULT_POOL_FEE;
    return [
      m.key,
      {
        loanDecimals: decimalsOf(m.loan),
        collateralDecimals: decimalsOf(m.collateral),
        poolFee: fee,
      },
    ];
  }),
);

/** Facts for a market key. Unknown keys get the long-market shape, which is the common case. */
export function factsFor(key: string): MarketFacts {
  return byKey.get(key) ?? { loanDecimals: 6, collateralDecimals: 18, poolFee: DEFAULT_POOL_FEE };
}
