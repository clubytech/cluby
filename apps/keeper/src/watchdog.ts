import type { Hex } from "viem";
import { marketCatalog, stocks, nativeTokens, tokens } from "@cluby/config";
import { readTwap, readPoolHealth } from "@cluby/sdk";
import { alert, isTransportFailure, recovered } from "./alerts.ts";
import { DIVERGENCE_BPS, GAS_FLOOR, MARKETS, account, log, pub } from "./env.ts";

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
  await checkGas();

  // Set by any market whose read failed for transport reasons; reported once, at the end.
  let transportFailed = false;

  for (const [key, deployed] of Object.entries(MARKETS)) {
    const def = marketCatalog.find((m) => m.key === key);
    if (!def) continue;
    const subject = def.side === "long" ? def.collateral : def.loan;

    const pool = poolFor(subject);
    const token = tokenFor(subject);
    if (!pool || !token) continue;

    let oraclePrice: bigint | null = null;
    try {
      oraclePrice = await pub.readContract({
        address: deployed.oracle as Hex,
        abi: [{ type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }],
        functionName: "price",
      });
    } catch (e) {
      // A host that is not answering is ONE fact about the run, not one fact per market. Reporting
      // it per market turned a single outage into a page of alerts, each naming a healthy oracle.
      if (isTransportFailure(e)) {
        transportFailed = true;
        continue;
      }
      await alert(
        `oracle-dead:${key}`,
        `${key}: the oracle reverted. Nothing can be liquidated on this market until it answers again.`,
      );
      continue;
    }
    await recovered(`oracle-dead:${key}`, `${key}: the oracle is answering again.`);
    if (!oraclePrice) continue;

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

    /**
     * Morpho's price is raw-to-raw on a 1e36 scale. For a long market — 18-decimal collateral
     * quoted in 6-decimal USDG — the human price is oraclePrice / 1e24.
     *
     * A short market is the same market inverted: the collateral is USDG and the borrowed asset is
     * the stock, so its oracle answers "stock per USDG" and the human price of the stock is
     * 1e48 / oraclePrice. Comparing the raw inverted number against a pool price reads as a
     * divergence of 10^23 basis points, which is not an alert, it is noise that buries real ones.
     */
    const oracleHuman = def.side === "short" ? 1e48 / Number(oraclePrice) : Number(oraclePrice) / 1e24;
    const divergenceBps = Math.round((Math.abs(oracleHuman - twap.price) / twap.price) * 10_000);

    log(`${key}: oracle ${oracleHuman.toFixed(4)} vs pool ${twap.price.toFixed(4)} (${divergenceBps} bps)`);

    if (divergenceBps > DIVERGENCE_BPS) {
      await alert(
        `divergence:${key}`,
        `${key}: the oracle says ${oracleHuman.toFixed(2)} and the pool says ${twap.price.toFixed(2)} — ${(divergenceBps / 100).toFixed(2)}% apart. Set this market's cap to 0 in the vault and pull the liquidity until they agree.`,
      );
    }
  }

  // One sentence about the run, whatever the outage touched, and one when it comes back. The point
  // is that a phone should be able to answer "is it still broken?" without opening a terminal.
  if (transportFailed) {
    await alert(
      "rpc-unreachable",
      "The node is not answering, so no market can be checked and nothing could be liquidated right now. The oracles and the contracts are not implicated — this is the RPC endpoint.",
    );
  } else {
    await recovered("rpc-unreachable", "The node is answering again. Markets are being checked normally.");
  }
}

/**
 * A signing key with no gas is a keeper that watches an underwater position and cannot act on it.
 * Nothing was checking this: the first symptom was `scores failed: … exceeds the balance` buried in
 * a log line nobody reads, and the same key signs liquidations.
 */
async function checkGas() {
  if (!account) return;
  let balance: bigint;
  try {
    balance = await pub.getBalance({ address: account.address });
  } catch (e) {
    log("could not read the keeper's gas balance:", (e as Error).message);
    return;
  }

  const eth = Number(balance) / 1e18;
  log(`keeper gas ${eth.toFixed(5)} ETH`);
  if (balance < GAS_FLOOR) {
    await alert(
      `gas-low:${account.address}`,
      `Keeper ${account.address} is down to ${eth.toFixed(5)} ETH of gas. Below this it cannot send a liquidation, and it will fail silently at the moment it is most needed. Top it up.`,
    );
  }
}
