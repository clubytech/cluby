import {
  FEED_MAX_AGE,
  LLTV,
  SAFE_CAP_MARGIN,
  external,
  marketCatalog,
  nativeTokens,
  stocks,
  tokens,
  type MarketDef,
} from "@cluby/config";

/** Where a symbol's ERC-20 lives, whichever family it belongs to. */
export function tokenAddressOf(symbol: string): `0x${string}` | null {
  if (symbol in tokens) return tokens[symbol as keyof typeof tokens].address as `0x${string}`;
  if (symbol in stocks) return stocks[symbol as keyof typeof stocks].address as `0x${string}`;
  if (symbol in nativeTokens) return nativeTokens[symbol as keyof typeof nativeTokens].address as `0x${string}`;
  return null;
}

export function decimalsOf(symbol: string): number {
  if (symbol in tokens) return tokens[symbol as keyof typeof tokens].decimals;
  return 18;
}

export function feedOf(symbol: string): `0x${string}` | null {
  if (symbol === "ETH" || symbol === "WETH") return external.ethUsdFeed as `0x${string}`;
  const s = stocks[symbol as keyof typeof stocks];
  return s && "feed" in s && s.feed ? (s.feed as `0x${string}`) : null;
}

export function poolOf(symbol: string) {
  if (symbol in stocks) return stocks[symbol as keyof typeof stocks].usdgPool;
  if (symbol in nativeTokens) return nativeTokens[symbol as keyof typeof nativeTokens].usdgPool;
  return null;
}

/** The asset a row is about: collateral on a long, the borrowed stock on a short. */
export const subjectOf = (m: MarketDef) => (m.side === "long" ? m.collateral : m.loan);

export const lltvOf = (m: MarketDef) => LLTV[m.tier];

/** The highest LTV the app will open a position at — always inside the liquidation line. */
export const safeLtvOf = (m: MarketDef) =>
  Math.max(0, Number(LLTV[m.tier]) / 1e18 - SAFE_CAP_MARGIN[m.tier] / 100);

export const maxAgeOf = (m: MarketDef) =>
  m.category === "Crypto" ? FEED_MAX_AGE.crypto : FEED_MAX_AGE.stock;

export const findMarket = (key: string) =>
  marketCatalog.find((m) => m.key.toLowerCase() === key.toLowerCase()) ?? null;

export { marketCatalog };
