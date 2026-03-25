export const lendingAbi = [
  {
    type: "event",
    name: "CollateralAllocated",
    inputs: [
      { name: "borrowerWallet", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Borrowed",
    inputs: [
      { name: "borrowerWallet", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "approvedMaxBorrow", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Repaid",
    inputs: [
      { name: "borrowerWallet", type: "address", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "borrowerWallet", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Liquidated",
    inputs: [
      { name: "borrowerWallet", type: "address", indexed: true },
      { name: "liquidator", type: "address", indexed: true },
      { name: "debtRepaid", type: "uint256", indexed: false },
      { name: "collateralSeized", type: "uint256", indexed: false }
    ]
  },
  {
    type: "function",
    name: "depositOwnerCollateral",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "allocateCollateralToBorrowers",
    stateMutability: "nonpayable",
    inputs: [
      { name: "borrowerWallets", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "allocationId", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "borrowerWallet", type: "address" }],
    outputs: [
      { name: "collateral", type: "uint256" },
      { name: "debt", type: "uint256" },
      { name: "exists", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "currentLtvBps",
    stateMutability: "view",
    inputs: [{ name: "borrowerWallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "liquidationLtvBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "liquidationBonusBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "targetLtvAfterLiquidationBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "borrow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "borrowerWallet", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "maxBorrow", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "expiresAt", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "backendSig", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "borrowerWallet", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
      { name: "expiresAt", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "ownerSignature", type: "bytes" },
      { name: "backendSignature", type: "bytes" }
    ],
    outputs: []
  }
] as const;
