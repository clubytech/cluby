/**
 * Cluby keeper: liquidations first, then the oracle watchdog.
 *
 * Env: RPC_URL (required), KEEPER_PK (optional — without it the keeper watches and alerts but never
 * signs), LENS_ADDR, FLASH_LIQ_ADDR, PONDER_URL, TELEGRAM_TOKEN, TELEGRAM_CHAT, POLL_MS,
 * WATCHDOG_MS, DIVERGENCE_BPS, MIN_PROFIT_USD, PROFIT_MARGIN_BPS, GAS_FLOOR.
 */
import { alert, isTransportFailure } from "./alerts.ts";
import { refreshBorrowers } from "./borrowers.ts";
import { scanHealth, tryLiquidate, warnIfClose } from "./liquidate.ts";
import { watchdogPass } from "./watchdog.ts";
import { scorePass } from "./scores.ts";
import { revertReason } from "./revert.ts";
import { LENS, LIQUIDATOR, POLL_MS, WATCHDOG_MS, account, log } from "./env.ts";

const WAD = 10n ** 18n;

/**
 * A quiet keeper and a wedged keeper produce the same log — nothing — and the difference is the
 * whole job. One line every few minutes says which one this is, and carries the two numbers an
 * operator would otherwise have to go and look up.
 */
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 5 * 60 * 1000);
let lastBeat = 0;

async function liquidationPass() {
  const watch = await refreshBorrowers();
  const candidates = await scanHealth(watch);

  if (Date.now() - lastBeat > HEARTBEAT_MS) {
    lastBeat = Date.now();
    const watched = [...watch.values()].reduce((a, s) => a + s.size, 0);
    const worstHf = candidates.length > 0 ? (Number(candidates[0]!.healthFactor) / 1e18).toFixed(4) : "n/a";
    log(`alive: ${watched} borrower(s) watched, ${candidates.length} with debt, worst HF ${worstHf}`);
  }

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

/**
 * A pass that throws must not take the loop down with it — the next tick is two seconds away.
 *
 * But it must not disappear either. A liquidation pass that throws every time looks, in the log,
 * exactly like one that found nothing, and the whole point of this keeper is that somebody hears
 * about it. The alert is deduplicated per pass name, so a persistent failure is one message an
 * hour rather than eighteen hundred.
 */
async function safely(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    // The message can carry the RPC URL, and the RPC URL carries the key; alert() redacts it.
    // A pass that failed because nobody answered the phone is a different thing from a pass that
    // failed on chain, and only one of them is about Cluby. The watchdog already reports an
    // unreachable node once for the whole run, so this stays quiet rather than saying it again in
    // different words — which is what produced two near-identical alerts for one outage.
    if (isTransportFailure(e)) {
      log(`${name} pass skipped: the node is not answering`);
      return;
    }
    await alert(`pass-failed:${name}`, `The ${name} pass is failing: ${revertReason(e)}`);
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

  // The watchdog is started, not awaited: liquidations are the job that cannot wait, and on a
  // forked or slow endpoint a price sweep across every market can take tens of seconds.
  void safely("watchdog", watchdogPass);
  setInterval(() => void safely("watchdog", watchdogPass), WATCHDOG_MS);

  // Scores move slowly and cost gas to publish, so they go out once an hour at most.
  void safely("scores", scorePass);
  setInterval(() => void safely("scores", scorePass), Number(process.env.SCORE_MS ?? 3_600_000));

  for (;;) {
    await safely("liquidation", liquidationPass);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void main();
