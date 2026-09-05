import { readFileSync, writeFileSync } from "node:fs";
import type { Hex } from "viem";
import { isAddress, parseAbiItem } from "viem";
import { CATCHUP_MS, LOG_CHUNK, MARKETS, MORPHO_BLUE, PONDER_URL, START_BLOCK, log, pub } from "./env.ts";

const borrowEvent = parseAbiItem(
  "event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)",
);

const marketIds = Object.entries(MARKETS).map(([key, m]) => ({ key, id: m.id as Hex }));
const allIds = marketIds.map((m) => m.id);
const knownMarketIds = new Set(allIds.map((id) => id.toLowerCase()));

/**
 * marketId → everyone who has ever borrowed there. Nobody is removed: debt only leaves by repayment
 * or liquidation, and re-checking a closed position costs one view call.
 */
const known = new Map<string, Set<string>>();
let scannedTo = 0n;

/**
 * Scan progress survives a restart. Without it every restart re-reads the whole history, and on a
 * ten-block-per-request plan that is thousands of calls before the keeper can act at all.
 */
const STATE_FILE = process.env.KEEPER_STATE ?? ".keeper-state.json";

function loadState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { scannedTo: string; borrowers: Record<string, string[]> };
    scannedTo = BigInt(s.scannedTo);
    for (const [id, users] of Object.entries(s.borrowers ?? {})) known.set(id, new Set(users));
    log(`resuming from block ${scannedTo} with ${[...known.values()].reduce((a, s2) => a + s2.size, 0)} known borrowers`);
  } catch {
    // No state yet, or it is unreadable: start from the deploy block.
  }
}

function saveState() {
  try {
    writeFileSync(
      STATE_FILE,
      JSON.stringify({
        scannedTo: scannedTo.toString(),
        borrowers: Object.fromEntries([...known].map(([id, users]) => [id, [...users]])),
      }),
    );
  } catch (e) {
    log("could not persist keeper state:", (e as Error).message);
  }
}

let loaded = false;

/**
 * Who to watch. The indexer knows, but the keeper must not depend on it — liquidation is the one
 * job that cannot wait for a service to come back — so it reads Morpho's own logs every pass and
 * treats the indexer as an extra source to union in, never as the answer.
 *
 * The distinction is the whole point. An indexer that is behind, mid-reindex, or freshly reorged
 * answers 200 with a short list or an empty one, and a keeper that returns early on a 200 then
 * reports "0 open positions" and raises nothing. That is not a failure anyone gets paged for; it
 * is a Tuesday. Only `!r.ok` and thrown errors used to fall through to the chain, which are the
 * two cases that were never the likely ones.
 *
 * The chunk size is small on purpose. Alchemy's free tier caps `eth_getLogs` at a TEN block range,
 * and with ~214 ms blocks that is two seconds of history per request: a naive scan from the deploy
 * block asks for a range the node refuses, and the whole pass dies. All three market ids go in one
 * request as a topic-OR, so the cost is one request per chunk rather than one per market.
 */
export async function refreshBorrowers(): Promise<Map<string, Set<string>>> {
  if (!loaded) {
    loadState();
    loaded = true;
  }
  // A hint, and only a hint: whatever it returns is added to what the chain says, not instead of it.
  if (PONDER_URL) await fromIndexer();

  const head = await pub.getBlockNumber();
  if (scannedTo === 0n) scannedTo = START_BLOCK > 0n ? START_BLOCK - 1n : head - LOG_CHUNK;
  if (head <= scannedTo) return known;

  const behind = head - scannedTo;
  if (behind > LOG_CHUNK * 8n) log(`${behind} blocks behind, catching up in chunks of ${LOG_CHUNK}`);

  // Bounded: the pass returns after a slice of work so health checks keep running while the scan
  // catches up. A cold start on the free tier is thousands of requests, and blocking the loop for
  // all of them would leave existing positions unwatched for minutes.
  const CONCURRENCY = 8;
  const deadline = Date.now() + CATCHUP_MS;

  while (scannedTo < head && Date.now() < deadline) {
    const batch: Promise<void>[] = [];
    let cursor = scannedTo;
    for (let i = 0; i < CONCURRENCY && cursor < head; i++) {
      const from = cursor + 1n;
      const to = from + LOG_CHUNK - 1n > head ? head : from + LOG_CHUNK - 1n;
      batch.push(scanRange(from, to));
      cursor = to;
    }
    await Promise.all(batch);
    scannedTo = cursor;
  }

  saveState();
  return known;
}

async function scanRange(from: bigint, to: bigint) {
  const logs = await pub.getLogs({
    address: MORPHO_BLUE,
    event: borrowEvent,
    args: { id: allIds },
    fromBlock: from,
    toBlock: to,
  });
  for (const l of logs) {
    const id = (l.args.id as Hex).toLowerCase();
    const onBehalf = l.args.onBehalf as Hex;
    if (add(id, onBehalf)) {
      const key = marketIds.find((m) => m.id.toLowerCase() === id)?.key ?? id;
      log("new borrower", key, onBehalf);
    }
  }
}

/**
 * Every row here came off an unauthenticated HTTP response, and creating a Morpho market is
 * permissionless — so an attacker who can answer as the indexer could otherwise name a market whose
 * oracle and loan token they wrote themselves, and the keeper would carry it into
 * `idToMarketParams` and sort a fabricated health factor ahead of a real debtor. Rows that are not
 * a market we deployed, addressed to something that is not an address, are dropped before they can
 * reach the watch set — which is now persisted, so a bad row would otherwise outlive the restart.
 */
async function fromIndexer(): Promise<void> {
  let dropped = 0;
  try {
    const r = await fetch(`${PONDER_URL}/positions/open`);
    if (!r.ok) {
      log(`indexer answered ${r.status}; chain scan continues`);
      return;
    }
    const body = await r.json();
    if (!Array.isArray(body)) {
      log("indexer returned a non-array; ignoring it");
      return;
    }
    for (const row of body as { marketId?: unknown; user?: unknown; borrowShares?: unknown }[]) {
      const marketId = typeof row?.marketId === "string" ? row.marketId.toLowerCase() : "";
      const user = typeof row?.user === "string" ? row.user : "";
      if (!knownMarketIds.has(marketId) || !isAddress(user)) {
        dropped++;
        continue;
      }
      let shares: bigint;
      try {
        shares = BigInt(row.borrowShares as string);
      } catch {
        dropped++;
        continue;
      }
      if (shares === 0n) continue;
      add(marketId, user);
    }
  } catch (e) {
    log(`indexer unreachable (${(e as Error).message}); chain scan continues`);
  }
  if (dropped > 0) log(`dropped ${dropped} indexer row(s) that named no market of ours`);
}

function add(marketId: string, user: string) {
  const set = known.get(marketId) ?? new Set<string>();
  const before = set.size;
  set.add(user.toLowerCase());
  known.set(marketId, set);
  return set.size > before;
}

export const watchedMarkets = marketIds;
