export const aggregatorV3Abi = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [
    { name: "roundId", type: "uint80" }, { name: "answer", type: "int256" }, { name: "startedAt", type: "uint256" },
    { name: "updatedAt", type: "uint256" }, { name: "answeredInRound", type: "uint80" } ] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "event", name: "AnswerUpdated", inputs: [
    { name: "current", type: "int256", indexed: true }, { name: "roundId", type: "uint256", indexed: true },
    { name: "updatedAt", type: "uint256", indexed: false } ] },
] as const;

export const stockTokenAbi = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "uiMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "oraclePaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "event", name: "Transfer", inputs: [
    { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false } ] },
] as const;

export const uniswapV3PoolAbi = [
  { type: "event", name: "Swap", inputs: [
    { name: "sender", type: "address", indexed: true }, { name: "recipient", type: "address", indexed: true },
    { name: "amount0", type: "int256", indexed: false }, { name: "amount1", type: "int256", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false }, { name: "liquidity", type: "uint128", indexed: false },
    { name: "tick", type: "int24", indexed: false } ] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
    { type: "uint160" }, { type: "int24" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }, { type: "uint8" }, { type: "bool" } ] },
  { type: "function", name: "increaseObservationCardinalityNext", stateMutability: "nonpayable", inputs: [{ type: "uint16" }], outputs: [] },
] as const;
