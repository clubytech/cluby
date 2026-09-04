import { createPublicClient, http } from "viem";
import { robinhoodChain } from "@cluby/config";

/**
 * Server-side reader.
 *
 * The public RPC rejects `eth_call` with 403 unless the request carries a User-Agent — any
 * non-empty value will do, but Node's fetch sends none, so every contract read fails while
 * `eth_chainId` keeps working and makes it look like the app, not the transport. Set it explicitly.
 *
 * The node is also pruned and has no archive: fine for the `latest` reads here, not for history.
 * Point CLUBY_RPC_URL at Alchemy before anything historical.
 */
export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(process.env.CLUBY_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0], {
    batch: { wait: 16, batchSize: 20 },
    retryCount: 2,
    timeout: 10_000,
    fetchOptions: { headers: { "user-agent": "cluby/1.0 (+https://cluby.xyz)" } },
  }),
});
