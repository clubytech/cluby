export const shortRouterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "market_",
        "type": "address",
        "internalType": "contract Market"
      },
      {
        "name": "swapRouter_",
        "type": "address",
        "internalType": "contract ISwapRouter02"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "closeShort",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      },
      {
        "name": "repayShares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "poolFee",
        "type": "uint24",
        "internalType": "uint24"
      },
      {
        "name": "maxUsdgIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "collateralOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "repaidAssets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "usdgSpent",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "market",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract Market"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openShort",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      },
      {
        "name": "collateralIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "borrowAssets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "poolFee",
        "type": "uint24",
        "internalType": "uint24"
      },
      {
        "name": "minProceeds",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "proceedsToCollateral",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [
      {
        "name": "proceeds",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapRouter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ISwapRouter02"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "ShortClosed",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "Id"
      },
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "repaidAssets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "usdgSpent",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "collateralOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ShortOpened",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "Id"
      },
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "collateralIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "borrowed",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "proceeds",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const;
