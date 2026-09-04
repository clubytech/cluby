export const lensAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "market_",
        "type": "address",
        "internalType": "contract Market"
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
    "name": "marketView",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct Lens.MarketView",
        "components": [
          {
            "name": "params",
            "type": "tuple",
            "internalType": "struct MarketParams",
            "components": [
              {
                "name": "stock",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "collateral",
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
              }
            ]
          },
          {
            "name": "state",
            "type": "tuple",
            "internalType": "struct MarketState",
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
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "feeBps",
                "type": "uint16",
                "internalType": "uint16"
              }
            ]
          },
          {
            "name": "risk",
            "type": "tuple",
            "internalType": "struct RiskParams",
            "components": [
              {
                "name": "initialMarginBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "liqThresholdBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "liqBonusBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "borrowCap",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "flags",
                "type": "uint8",
                "internalType": "uint8"
              }
            ]
          },
          {
            "name": "utilizationWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "borrowAprWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "supplyAprWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "price",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "priceOk",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "quote",
            "type": "tuple",
            "internalType": "struct StockOracle.Quote",
            "components": [
              {
                "name": "feedPrice",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "twapPrice",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "feedUpdatedAt",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "feedFresh",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "feedValid",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "twapValid",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          },
          {
            "name": "weekendMode",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "availableToBorrow",
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
    "name": "userView",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      },
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "u",
        "type": "tuple",
        "internalType": "struct Lens.UserView",
        "components": [
          {
            "name": "pos",
            "type": "tuple",
            "internalType": "struct Position",
            "components": [
              {
                "name": "supplyShares",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "borrowShares",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "collateral",
                "type": "uint128",
                "internalType": "uint128"
              }
            ]
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
            "name": "debtValue",
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
            "name": "maxBorrowAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "withdrawableCollateral",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  }
] as const;
