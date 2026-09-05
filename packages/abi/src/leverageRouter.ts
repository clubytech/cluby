export const leverageRouterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_morpho",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_router",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "close",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct LeverageRouter.CloseParams",
        "components": [
          {
            "name": "marketParams",
            "type": "tuple",
            "internalType": "struct MarketParams",
            "components": [
              {
                "name": "loanToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "collateralToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "oracle",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "irm",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "lltv",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "repayAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "repayShares",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "collateralToSell",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "swapFee",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "minLoanOut",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "onBehalf",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "flashAmount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "morpho",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IMorpho"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "onMorphoFlashLoan",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "open",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct LeverageRouter.OpenParams",
        "components": [
          {
            "name": "marketParams",
            "type": "tuple",
            "internalType": "struct MarketParams",
            "components": [
              {
                "name": "loanToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "collateralToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "oracle",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "irm",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "lltv",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "equityCollateral",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "flashAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "swapFee",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "minCollateralOut",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "onBehalf",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "router",
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
    "name": "Closed",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "repaid",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "collateralSold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "returned",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Opened",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "equity",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "exposure",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "debt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "InconsistentInput",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAuthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotMorpho",
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
    "name": "SwapShortfall",
    "inputs": [
      {
        "name": "received",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  }
] as const;
