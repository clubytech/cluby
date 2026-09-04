import { createPublicClient, http } from "viem";
import { robinhoodChain } from "@cluby/config";

/**
 * Server-side reader. The public RPC is pruned and rate-limited — fine for `latest` calls like
 * these, but set CLUBY_RPC_URL to the Alchemy endpoint before anything historical.
 */
export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.CLUBY_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0], {
    batch: true,
    retryCount: 2,
    timeout: 8_000,
  }),
});
