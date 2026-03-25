# Frontend

Next.js app-router frontend for the privacy lending prototype.

## What it does

- connects the owner wallet `A`
- shows `홈`, `예치`, `대출`, `상환`, `전체 포지션` tabs
- creates local borrower wallets `B1..Bn`
- prepares and signs the split plan
- submits owner approve/deposit flows
- previews and executes borrow / repay / withdraw flows
- renders position cards from contract reads

## Environment

Copy `.env.example` to `.env.local` and fill:

```dotenv
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<walletconnect project id>
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_COLLATERAL_ADDRESS=<deployed collateral token>
NEXT_PUBLIC_DEBT_ADDRESS=<deployed debt token>
NEXT_PUBLIC_LENDING_ADDRESS=<deployed lending contract>
```

## Local setup

1. Install dependencies

```sh
npm install
```

2. Start the dev server

```sh
npm run dev
```

## Notes

- The frontend assumes Anvil and the backend are already running.
- Generated `B` wallets are currently stored locally in the browser for UX.
- Repay flows require switching MetaMask to the selected `B` wallet.
