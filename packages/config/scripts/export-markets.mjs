/**
 * Writes contracts/config/markets.json from the TypeScript catalog, so the deploy scripts and the
 * app cannot disagree about which markets exist or what their parameters are. Run before deploying:
 *   node packages/config/scripts/export-markets.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { marketCatalog, stocks, nativeTokens, tokens, external, morpho, LLTV, vaultCatalog } = await import(
  join(root, "packages/config/src/index.ts")
);

const ZERO = "0x0000000000000000000000000000000000000000";

const addressOf = (symbol) =>
  tokens[symbol]?.address ?? stocks[symbol]?.address ?? nativeTokens[symbol]?.address ?? null;
const feedOf = (symbol) =>
  symbol === "WETH" || symbol === "ETH" ? external.ethUsdFeed : (stocks[symbol]?.feed ?? null);
const poolOf = (symbol) => stocks[symbol]?.usdgPool ?? nativeTokens[symbol]?.usdgPool ?? null;

const markets = marketCatalog
  .filter((m) => m.status !== "blocked")
  .map((m) => {
    const subject = m.side === "long" ? m.collateral : m.loan;
    const pool = poolOf(subject);
    return {
      key: m.key,
      side: m.side,
      collateralToken: addressOf(m.collateral),
      loanToken: addressOf(m.loan),
      subject,
      subjectToken: addressOf(subject),
      // Zero rather than null: Solidity's JSON reader has no notion of absent, and a zero address
      // fails loudly at the point of use instead of parsing into something unpredictable.
      feed: feedOf(subject) ?? ZERO,
      pool: pool?.address ?? ZERO,
      poolFee: pool?.fee ?? 0,
      poolCardinality: pool?.cardinality ?? 0,
      oracleKind: m.oracle,
      lltv: LLTV[m.tier].toString(),
      supplyCapUsd: m.supplyCapUsd,
      collateralDecimals: m.collateral === "USDG" ? 6 : 18,
      loanDecimals: m.loan === "USDG" ? 6 : 18,
    };
  })
  .filter((m) => m.collateralToken && m.loanToken);

const out = {
  chainId: 4663,
  morpho: {
    blue: morpho.blue.address,
    irm: morpho.adaptiveCurveIrm.address,
    chainlinkOracleFactory: morpho.chainlinkOracleV2Factory.address,
  },
  twapWindow: 1800,
  // Solidity's JSON reader cannot ask an array for its length, so the count travels with the data.
  marketCount: markets.length,
  markets,
  vaults: vaultCatalog.map((v) => ({ key: v.key, asset: v.asset, markets: v.markets })),
};

mkdirSync(join(root, "contracts/config"), { recursive: true });
writeFileSync(join(root, "contracts/config/markets.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${markets.length} markets to contracts/config/markets.json`);
