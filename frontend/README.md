# Frontend
<img width="2442" height="1424" alt="image" src="https://github.com/user-attachments/assets/26e053c4-af3c-4840-ab5a-39f626ced3ce" />
<img width="2432" height="1638" alt="image" src="https://github.com/user-attachments/assets/2caf6a7f-2431-498b-9f07-49f4c53ba735" />
<img width="2516" height="1620" alt="image" src="https://github.com/user-attachments/assets/9f33484e-e41e-4ca8-8408-25d3ca711a2c" />
<img width="2438" height="1654" alt="image" src="https://github.com/user-attachments/assets/a497b1f6-df86-4349-b39a-65862dbc1d5a" />
<img width="2422" height="1626" alt="image" src="https://github.com/user-attachments/assets/cb0dcfb9-a9ce-46cd-a12c-a5bd2ddfb0e7" />
<img width="2432" height="1436" alt="image" src="https://github.com/user-attachments/assets/9b7a3d05-8ddd-4464-b420-02108d368277" />
<img width="2294" height="1650" alt="image" src="https://github.com/user-attachments/assets/720ae45e-685f-4aff-a90a-59ef37089ac1" />

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
