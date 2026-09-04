import type { Hex } from "viem";
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
  const rows = (await res.json()) as { id: Hex; score: number }[];
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
