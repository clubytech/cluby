import { createConfig } from "ponder";
import { morpho, deployments } from "@cluby/config";
import { morphoBlueEventsAbi, vaultEventsAbi } from "@cluby/sdk";

/**
 * Env:
 *   PONDER_RPC_URL_4663  RPC (anvil fork for development, Alchemy for mainnet)
 *   START_BLOCK          block the first Cluby market was created at
 *   VAULT_ADDRESSES      comma-separated vault addresses, if not yet in @cluby/config
 *
 * Morpho Blue is a singleton carrying every market on the chain, most of which are not ours.
 * Indexing all of them would bury our data, so every event is filtered by the market ids we
 * created — which are known ahead of time, because a Morpho id is the hash of its params.
 */
const START = Number(process.env.START_BLOCK ?? 0);

const ourMarketIds = Object.values(deployments.markets).map((m) => m.id);
const vaultAddresses = (process.env.VAULT_ADDRESSES?.split(",").filter(Boolean) ??
  Object.values(deployments.vaults)) as `0x${string}`[];

export default createConfig({
  chains: {
    robinhood: {
      id: 4663,
      /**
       * Ponder gets the PUBLIC node, and only the public node.
       *
       * It serves eth_getLogs over tens of thousands of blocks without rate-limiting, which is what
       * following a chain that produces a block every 214 ms needs; Alchemy's free tier caps the
       * same call at TEN blocks and 429s under load, so the backfill never finishes there. Listing
       * both is worse than either: Ponder spreads requests across the list, so a wide sweep lands
       * on Alchemy every other time and takes the process down with it.
       *
       * The public node is pruned, so historical state cannot come from here — src/snapshot.ts
       * holds its own archive client for that, and the routing is explicit rather than hoped for.
       */
      rpc: process.env.PONDER_LOGS_RPC ?? "https://rpc.mainnet.chain.robinhood.com",
      ethGetLogsBlockRange: Number(process.env.LOG_CHUNK ?? 10_000),
      maxRequestsPerSecond: Number(process.env.MAX_RPS ?? 20),
      pollingInterval: Number(process.env.POLLING_MS ?? 2000),
    },
  },
  contracts: {
    MorphoBlue: {
      abi: morphoBlueEventsAbi,
      chain: "robinhood",
      address: morpho.blue.address as `0x${string}`,
      startBlock: START,
      // Ponder filters per event, so each id-carrying event gets the same id list.
      // No ids yet means the deploy has not run; index nothing rather than the whole chain.
      filter:
        ourMarketIds.length > 0
          ? ([
              "CreateMarket",
              "Supply",
              "Withdraw",
              "Borrow",
              "Repay",
              "SupplyCollateral",
              "WithdrawCollateral",
              "Liquidate",
              "AccrueInterest",
            ] as const).map((event) => ({ event, args: { id: ourMarketIds } }))
          : undefined,
    },
    Vault: {
      abi: vaultEventsAbi,
      chain: "robinhood",
      address: vaultAddresses,
      startBlock: START,
    },
  },
  blocks: {
    // ~214 ms blocks on this chain, so 1,400 blocks is about five minutes.
    Snapshot: { chain: "robinhood", interval: 1400, startBlock: START },
  },
});
