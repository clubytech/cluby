export const kinkedIrmAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "dflt",
        "type": "tuple",
        "internalType": "struct KinkedIRM.Curve",
        "components": [
          {
            "name": "baseApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kinkApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kink",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MAX_APR",
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
    "name": "SECONDS_PER_YEAR",
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
    "name": "borrowApr",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      },
      {
        "name": "u",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "borrowRate",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      },
      {
        "name": "utilizationWad",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "clearCurve",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "curveOf",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct KinkedIRM.Curve",
        "components": [
          {
            "name": "baseApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kinkApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kink",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "defaultCurve",
    "inputs": [],
    "outputs": [
      {
        "name": "baseApr",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "kinkApr",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxApr",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "kink",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasCurve",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "Id"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
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
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setCurve",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "Id"
      },
      {
        "name": "c",
        "type": "tuple",
        "internalType": "struct KinkedIRM.Curve",
        "components": [
          {
            "name": "baseApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kinkApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kink",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDefaultCurve",
    "inputs": [
      {
        "name": "c",
        "type": "tuple",
        "internalType": "struct KinkedIRM.Curve",
        "components": [
          {
            "name": "baseApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kinkApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kink",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
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
    "name": "CurveCleared",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "Id"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CurveSet",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "Id"
      },
      {
        "name": "curve",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct KinkedIRM.Curve",
        "components": [
          {
            "name": "baseApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kinkApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kink",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DefaultCurveSet",
    "inputs": [
      {
        "name": "curve",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct KinkedIRM.Curve",
        "components": [
          {
            "name": "baseApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kinkApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxApr",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kink",
            "type": "uint64",
            "internalType": "uint64"
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
    "type": "error",
    "name": "InvalidCurve",
    "inputs": []
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
  }
] as const;
