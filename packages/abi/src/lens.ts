export const lensAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_morpho",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "healthFactors",
    "inputs": [
      {
        "name": "params",
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
        "name": "users",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "hfs",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "marketView",
    "inputs": [
      {
        "name": "params",
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
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct Lens.MarketView",
        "components": [
          {
            "name": "id",
            "type": "bytes32",
            "internalType": "Id"
          },
          {
            "name": "params",
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
            "name": "state",
            "type": "tuple",
            "internalType": "struct Market",
            "components": [
              {
                "name": "totalSupplyAssets",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "totalSupplyShares",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "totalBorrowAssets",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "totalBorrowShares",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "lastUpdate",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "fee",
                "type": "uint128",
                "internalType": "uint128"
              }
            ]
          },
          {
            "name": "utilizationWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "borrowRatePerSecond",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "borrowApyWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "supplyApyWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liquidityAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "price",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "marketViews",
    "inputs": [
      {
        "name": "paramsList",
        "type": "tuple[]",
        "internalType": "struct MarketParams[]",
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
      }
    ],
    "outputs": [
      {
        "name": "out",
        "type": "tuple[]",
        "internalType": "struct Lens.MarketView[]",
        "components": [
          {
            "name": "id",
            "type": "bytes32",
            "internalType": "Id"
          },
          {
            "name": "params",
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
            "name": "state",
            "type": "tuple",
            "internalType": "struct Market",
            "components": [
              {
                "name": "totalSupplyAssets",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "totalSupplyShares",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "totalBorrowAssets",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "totalBorrowShares",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "lastUpdate",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "fee",
                "type": "uint128",
                "internalType": "uint128"
              }
            ]
          },
          {
            "name": "utilizationWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "borrowRatePerSecond",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "borrowApyWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "supplyApyWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liquidityAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "price",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
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
    "name": "previewBorrow",
    "inputs": [
      {
        "name": "params",
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
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "addCollateral",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "addBorrow",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "safeMarginWad",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "u",
        "type": "tuple",
        "internalType": "struct Lens.UserView",
        "components": [
          {
            "name": "collateral",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "collateralValue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "supplyAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "borrowAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxBorrowAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "safeBorrowAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "healthFactorWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liquidationPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liquidatable",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "userView",
    "inputs": [
      {
        "name": "params",
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
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "safeMarginWad",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "u",
        "type": "tuple",
        "internalType": "struct Lens.UserView",
        "components": [
          {
            "name": "collateral",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "collateralValue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "supplyAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "borrowAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxBorrowAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "safeBorrowAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "healthFactorWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liquidationPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "liquidatable",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  }
] as const;
