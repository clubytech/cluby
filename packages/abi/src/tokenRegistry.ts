/**
 * The registry the site reads the token's address from. `listing()` is one call rather than four
 * because the page renders it as one row, and a page that renders in four round trips renders in
 * four states.
 */
export const tokenRegistryAbi = [
  {
    type: "function",
    name: "listing",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "token", type: "address" },
      { name: "pool", type: "address" },
      { name: "listedAt", type: "uint64" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "totalSupply", type: "uint256" },
    ],
  },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pool", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "setToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_pool", type: "address" },
    ],
    outputs: [],
  },
  { type: "function", name: "clear", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "event",
    name: "TokenSet",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "at", type: "uint64", indexed: false },
    ],
  },
  { type: "error", name: "NotAContract", inputs: [{ name: "given", type: "address" }] },
] as const;
