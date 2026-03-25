export const collateralAddress = process.env.NEXT_PUBLIC_COLLATERAL_ADDRESS as `0x${string}`;
export const debtAddress = process.env.NEXT_PUBLIC_DEBT_ADDRESS as `0x${string}`;
export const lendingAddress = process.env.NEXT_PUBLIC_LENDING_ADDRESS as `0x${string}`;

export const collateralAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export const debtAbi = collateralAbi;

export const lendingAbi = [
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
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "borrowerWallet", type: "address" },
      { name: "amount", type: "uint256" }
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
  },
  {
    type: "function",
    name: "liquidate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "borrowerWallet", type: "address" },
      { name: "repayAmount", type: "uint256" }
    ],
    outputs: []
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
  }
] as const;
