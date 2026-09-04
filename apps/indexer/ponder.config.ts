import { createConfig } from "ponder";
import { marketAbi, aggregatorV3Abi } from "@cluby/abi";
import { stocks } from "@cluby/config";

/**
 * Env:
 *  PONDER_RPC_URL_4663  RPC (anvil fork or Alchemy)
 *  MARKET_ADDR          Market singleton
 *  START_BLOCK          deployment block
 *  FEED_START_BLOCK     (optional) where to start feed history, defaults to START_BLOCK
 */
const MARKET = process.env.MARKET_ADDR as `0x${string}`;
const START = Number(process.env.START_BLOCK ?? 0);
const FEED_START = Number(process.env.FEED_START_BLOCK ?? START);

const feedAggregators = Object.values(stocks)
  .map((s) => s.feedAggregator)
  .filter(Boolean) as `0x${string}`[];

export default createConfig({
  chains: {
    robinhood: { id: 4663, rpc: process.env.PONDER_RPC_URL_4663! },
  },
  contracts: {
    Market: { abi: marketAbi, chain: "robinhood", address: MARKET, startBlock: START },
    Feed: { abi: aggregatorV3Abi, chain: "robinhood", address: feedAggregators, startBlock: FEED_START },
  },
  blocks: {
    // ~5 blocks/s on this chain: 1500 blocks ~= 5 minutes
    Snapshot: { chain: "robinhood", interval: 1500, startBlock: START },
  },
});
