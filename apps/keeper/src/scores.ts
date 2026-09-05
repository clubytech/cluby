import type { Hex } from "viem";
import { isAddress } from "viem";
import { creditRegistryAbi } from "@cluby/abi";
import { deployments } from "@cluby/config";
import { alert } from "./alerts.ts";
import { PONDER_URL, account, log, pub, wallet } from "./env.ts";

const REGISTRY = (process.env.CREDIT_REGISTRY ?? deployments.creditRegistry) as Hex | undefined;

/**
 * Publish the indexer's scores on chain.
 *
 * Only what changed is written: a score that has not moved costs gas to rewrite and tells nobody
 * anything. Nothing here can affect what a borrower may borrow — the registry feeds rebates.
 */
export async function scorePass() {
  if (!REGISTRY || !PONDER_URL) return;

  const res = await fetch(`${PONDER_URL}/scores`).catch(() => null);
  if (!res?.ok) return;
  const body = await res.json().catch(() => null);
  if (!Array.isArray(body)) {
    log("scores: the indexer returned something that is not a list");
    return;
  }

  // Every element here arrives over unauthenticated HTTP and ends up in a signed transaction from
  // an address the registry trusts. The contract bounds the VALUE at 1000; nothing bounds WHOSE
  // address is in the array, so an indexer that has been tampered with could publish a score
  // against anyone. Shape-check before signing, not after.
  const rows: { id: Hex; score: number }[] = [];
  let dropped = 0;
  for (const row of body as { id?: unknown; score?: unknown }[]) {
    const id = typeof row?.id === "string" ? row.id : "";
    const score = typeof row?.score === "number" ? row.score : NaN;
    if (!isAddress(id) || !Number.isInteger(score) || score < 0 || score > 1000) {
      dropped++;
      continue;
    }
    rows.push({ id: id as Hex, score });
  }
  if (dropped > 0) log(`scores: dropped ${dropped} malformed row(s)`);
  if (rows.length === 0) return;

  const onChain = await Promise.all(
    rows.map((r) =>
      pub
        .readContract({ address: REGISTRY, abi: creditRegistryAbi, functionName: "scoreOf", args: [r.id] })
        .catch(() => null),
    ),
  );

  const changed = rows.filter((r, i) => {
    const current = onChain[i] as readonly [number, bigint] | null;
    return current === null || Number(current[0]) !== r.score;
  });

  if (changed.length === 0) {
    log(`scores: ${rows.length} up to date`);
    return;
  }

  if (!wallet || !account) {
    log(`scores: ${changed.length} would be written, but the keeper has no key`);
    return;
  }

  const hash = await wallet.writeContract({
    address: REGISTRY,
    abi: creditRegistryAbi,
    functionName: "setScores",
    args: [changed.map((r) => r.id), changed.map((r) => r.score)],
    chain: wallet.chain,
    account,
  });
  await pub.waitForTransactionReceipt({ hash });
  await alert(`scores:${hash}`, `Published ${changed.length} credit scores. ${hash}`);
}
