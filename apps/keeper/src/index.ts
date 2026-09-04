/**
 * Cluby keeper: liquidations first, then the oracle watchdog.
 *
 * Env: RPC_URL (required), KEEPER_PK (optional — without it the keeper watches and alerts but never
 * signs), LENS_ADDR, FLASH_LIQ_ADDR, PONDER_URL, TELEGRAM_TOKEN, TELEGRAM_CHAT, POLL_MS,
 * WATCHDOG_MS, DIVERGENCE_BPS, MIN_PROFIT.
 */
import { alert } from "./alerts.ts";
import { refreshBorrowers } from "./borrowers.ts";
import { scanHealth, tryLiquidate, warnIfClose } from "./liquidate.ts";
import { watchdogPass } from "./watchdog.ts";
import { LENS, LIQUIDATOR, POLL_MS, WATCHDOG_MS, account, log } from "./env.ts";

const WAD = 10n ** 18n;

async function liquidationPass() {
  const watch = await refreshBorrowers();
  const candidates = await scanHealth(watch);
  if (candidates.length === 0) return;

  const worst = candidates[0]!;
  log(`${candidates.length} open positions, worst HF ${Number(worst.healthFactor) / 1e18}`);

  for (const c of candidates) {
    if (c.healthFactor < WAD) {
      await tryLiquidate(c);
    } else {
      await warnIfClose(c);
    }
  }
}

/** A pass that throws must not take the loop down with it — the next tick is two seconds away. */
async function safely(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    // The message can carry the RPC URL, and the RPC URL carries the key; log() redacts it.
    log(`${name} failed:`, (e as Error).message);
  }
}

async function main() {
  log("keeper starting");
  log("  lens      ", LENS);
  log("  liquidator", LIQUIDATOR);
  log("  signer    ", account?.address ?? "none — watch-only");

  if (!account) {
    await alert("watch-only", "Keeper started without a key: it will report what it would have done, and sign nothing.");
  }

  await safely("watchdog", watchdogPass);
  setInterval(() => void safely("watchdog", watchdogPass), WATCHDOG_MS);

  for (;;) {
    await safely("liquidation", liquidationPass);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void main();
