export const stockOracleAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MAX_HARD_AGE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_TWAP_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_TWAP_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PRICE_SCALE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "config",
    "inputs": [
      {
        "name": "stock",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct StockOracle.Cfg",
        "components": [
          {
            "name": "feed",
            "type": "address",
            "internalType": "contract IAggregatorV3"
          },
          {
            "name": "softAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "hardAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "v3Pool",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "twapWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "multiplierGuard",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "feedScale",
            "type": "uint96",
            "internalType": "uint96"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "price",
    "inputs": [
      {
        "name": "stock",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quote",
    "inputs": [
      {
        "name": "stock",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "q",
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
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sequencerFeed",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAggregatorV3"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sequencerGracePeriod",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setConfig",
    "inputs": [
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
        "name": "c",
        "type": "tuple",
        "internalType": "struct StockOracle.Cfg",
        "components": [
          {
            "name": "feed",
            "type": "address",
            "internalType": "contract IAggregatorV3"
          },
          {
            "name": "softAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "hardAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "v3Pool",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "twapWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "multiplierGuard",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "feedScale",
            "type": "uint96",
            "internalType": "uint96"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSequencerFeed",
    "inputs": [
      {
        "name": "feed",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "gracePeriod",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ConfigSet",
    "inputs": [
      {
        "name": "stock",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "cfg",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct StockOracle.Cfg",
        "components": [
          {
            "name": "feed",
            "type": "address",
            "internalType": "contract IAggregatorV3"
          },
          {
            "name": "softAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "hardAge",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "v3Pool",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "twapWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "multiplierGuard",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "feedScale",
            "type": "uint96",
            "internalType": "uint96"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SequencerFeedSet",
    "inputs": [
      {
        "name": "feed",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "gracePeriod",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadConfig",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CorporateAction",
    "inputs": [
      {
        "name": "stock",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoPrice",
    "inputs": [
      {
        "name": "stock",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotConfigured",
    "inputs": [
      {
        "name": "stock",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PoolMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SequencerDown",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TickOutOfRange",
    "inputs": []
  }
] as const;
