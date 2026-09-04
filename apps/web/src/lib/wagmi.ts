import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChain } from "@cluby/config";

/**
 * Injected wallets only, for now. WalletConnect would need a project id and a relay; MetaMask and
 * anything else that injects works without either, and adding a second connector later changes one
 * line here rather than anything downstream.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: {
    [robinhoodChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0], {
      // The public node refuses eth_call without a User-Agent; browsers always send one, so this
      // only matters when the same config is exercised server-side.
      fetchOptions: { headers: { "user-agent": "cluby-web/1.0" } },
    }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
