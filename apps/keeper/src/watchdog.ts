import type { Hex } from "viem";
import { marketCatalog, stocks, nativeTokens, tokens } from "@cluby/config";
import { readTwap, readPoolHealth } from "@cluby/sdk";
import { alert } from "./alerts.ts";
import { DIVERGENCE_BPS, MARKETS, log, pub } from "./env.ts";

const ORACLE_SCALE = 10n ** 36n;

const poolFor = (symbol: string) =>
  (stocks as Record<string, any>)[symbol]?.usdgPool ?? (nativeTokens as Record<string, any>)[symbol]?.usdgPool ?? null;
const tokenFor = (symbol: string) =>
  (stocks as Record<string, any>)[symbol]?.address ??
  (nativeTokens as Record<string, any>)[symbol]?.address ??
  (tokens as Record<string, any>)[symbol]?.address ??
  null;

/**
 * The second line of defence, and for now the only automatic one: compare what the market's oracle
 * says against what the DEX is actually trading at.
 *
 * It does not touch caps by itself. Lowering a cap is a decision with consequences for depositors,
 * and a watchdog that acts on a divergence it may have measured wrongly can do more damage than the
 * divergence. So it tells a human, precisely, what it saw and what to do about it.
 */
export async function watchdogPass() {
  for (const [key, deployed] of Object.entries(MARKETS)) {
    const def = marketCatalog.find((m) => m.key === key);
    if (!def) continue;
    const subject = def.side === "long" ? def.collateral : def.loan;

    const pool = poolFor(subject);
    const token = tokenFor(subject);
    if (!pool || !token) continue;

    const oraclePrice = await pub
      .readContract({
        address: deployed.oracle as Hex,
        abi: [{ type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }],
        functionName: "price",
      })
      .catch(() => null);
    if (!oraclePrice) {
      await alert(`oracle-dead:${key}`, `${key}: the oracle did not answer. Nothing can be liquidated on this market until it does.`);
      continue;
    }

    const twap = await readTwap(pub, pool.address as Hex, token as Hex, "0x" as Hex, {
      windowSeconds: 1800,
      tokenDecimals: 18,
      quoteDecimals: 6,
    });
    if (!twap) {
      const health = await readPoolHealth(pub, pool.address as Hex).catch(() => null);
      log(`no TWAP for ${key}`, health ? `cardinality ${health.observationCardinality}` : "pool unreadable");
      continue;
    }

    // Morpho's price is raw-to-raw on a 1e36 scale, so for an 18-decimal collateral quoted in
    // 6-decimal USDG the human price is oraclePrice / 1e24. Same conversion the site does.
    const oracleHuman = Number(oraclePrice) / 1e24;
    const divergenceBps = Math.round((Math.abs(oracleHuman - twap.price) / twap.price) * 10_000);

    log(`${key}: oracle ${oracleHuman.toFixed(4)} vs pool ${twap.price.toFixed(4)} (${divergenceBps} bps)`);

    if (divergenceBps > DIVERGENCE_BPS) {
      await alert(
        `divergence:${key}`,
        `${key}: the oracle says ${oracleHuman.toFixed(2)} and the pool says ${twap.price.toFixed(2)} — ${(divergenceBps / 100).toFixed(2)}% apart. Set this market's cap to 0 in the vault and pull the liquidity until they agree.`,
      );
    }
  }
}
