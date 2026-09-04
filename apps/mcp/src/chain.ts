import { createPublicClient, http } from "viem";
import { robinhoodChain } from "@cluby/config";

/**
 * The public node 403s eth_call without a User-Agent — Node's fetch sends none, so every read
 * fails while the chain id call keeps working. Set CLUBY_RPC_URL to an archive endpoint for
 * anything historical.
 */
export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.CLUBY_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0], {
    batch: { wait: 16, batchSize: 20 },
    retryCount: 2,
    timeout: 10_000,
    fetchOptions: { headers: { "user-agent": "cluby-mcp/1.0" } },
  }),
});

export const INDEXER_URL = process.env.CLUBY_INDEXER_URL ?? "";

/** The indexer is optional: everything an agent needs about the present comes from the chain. */
export async function fromIndexer<T>(path: string): Promise<T | null> {
  if (!INDEXER_URL) return null;
  try {
    const r = await fetch(`${INDEXER_URL}${path}`);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
