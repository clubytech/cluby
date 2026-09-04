/** Event ABIs the indexer subscribes to. Morpho Blue first, then the vault. */

export const morphoBlueEventsAbi = [
  {
    type: "event",
    name: "CreateMarket",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      {
        name: "marketParams",
        type: "tuple",
        indexed: false,
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "Supply",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      // Indexed here, unindexed on Withdraw and Borrow. Getting this wrong does not throw —
      // the log simply never decodes, and the event vanishes from the index.
      { name: "caller", type: "address", indexed: true },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: false },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Borrow",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: false },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Repay",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SupplyCollateral",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WithdrawCollateral",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: false },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Liquidate",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "borrower", type: "address", indexed: true },
      { name: "repaidAssets", type: "uint256", indexed: false },
      { name: "repaidShares", type: "uint256", indexed: false },
      { name: "seizedAssets", type: "uint256", indexed: false },
      { name: "badDebtAssets", type: "uint256", indexed: false },
      { name: "badDebtShares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccrueInterest",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "prevBorrowRate", type: "uint256", indexed: false },
      { name: "interest", type: "uint256", indexed: false },
      { name: "feeShares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FlashLoan",
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
    ],
  },
] as const;

/** MetaMorpho / Vault V2 surface: deposits, withdrawals, cap changes and reallocation. */
export const vaultEventsAbi = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SetCap",
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "id", type: "bytes32", indexed: true },
      { name: "cap", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ReallocateSupply",
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "id", type: "bytes32", indexed: true },
      { name: "suppliedAssets", type: "uint256", indexed: false },
      { name: "suppliedShares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ReallocateWithdraw",
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "id", type: "bytes32", indexed: true },
      { name: "withdrawnAssets", type: "uint256", indexed: false },
      { name: "withdrawnShares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccrueInterest",
    inputs: [
      { name: "newTotalAssets", type: "uint256", indexed: false },
      { name: "feeShares", type: "uint256", indexed: false },
    ],
  },
] as const;
