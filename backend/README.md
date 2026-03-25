# Backend

NestJS backend for the privacy lending prototype.

## What it does

- returns owner policy and collateral quotes
- verifies owner `A` split-plan signatures for `B[]`
- relays split allocation, borrow, and withdraw transactions
- stores private `A -> B[]` linkage in Postgres
- indexes onchain position events into DB tables
- exposes owner and borrower lookup endpoints for the frontend

## Main modules

- `src/loan/`: quote, borrow, withdraw, repay sync
- `src/delegation/`: split-plan verification and owner/B mapping
- `src/indexer/`: position event indexing and state sync
- `src/persistence/entities/`: TypeORM entities

## Environment

Copy `.env.example` to `.env` and fill:

```dotenv
PORT=3001
DATABASE_URL=postgres://postgres:postgres@localhost:5432/karma_lending
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
LENDING_ADDRESS=<deployed lending contract>
TRUSTED_BACKEND_PRIVATE_KEY=<anvil account(1) private key>
SPLIT_PLAN_SIGNER_NAME=KarmaLendingSplitPlan
SPLIT_PLAN_SIGNER_VERSION=1
SESSION_SALT=<local salt>
```

## Local setup

1. Start Postgres

```sh
docker compose up -d
```

2. Install dependencies

```sh
npm install
```

3. Run the backend

```sh
npm run start:dev
```

## Notes

- The backend expects the contracts to be deployed on Anvil first.
- Position state is synced from onchain events after successful execution flows.
- `split_plan_records` stores private owner-to-borrower linkage and split-plan history.
- The contract read is still the clearest source of truth for live position values.
- `position_state_records` is an offchain projection/snapshot kept for lookup, indexing, and recovery safety.
- In practice:
  - onchain `read` is the final source of truth for `collateral`, `debt`, and current LTV
  - `position_state_records` helps the backend list positions, map owners to borrower wallets, and recover state if the UI or index flow needs a stable snapshot
