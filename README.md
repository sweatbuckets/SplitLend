<img width="2442" height="1424" alt="image" src="https://github.com/user-attachments/assets/26e053c4-af3c-4840-ab5a-39f626ced3ce" />
<img width="2630" height="1624" alt="image" src="https://github.com/user-attachments/assets/18335a23-408b-4f12-b5a6-23fee48760c9" />
<img width="2516" height="1620" alt="image" src="https://github.com/user-attachments/assets/9f33484e-e41e-4ca8-8408-25d3ca711a2c" />
<img width="2438" height="1654" alt="image" src="https://github.com/user-attachments/assets/a497b1f6-df86-4349-b39a-65862dbc1d5a" />
<img width="2422" height="1626" alt="image" src="https://github.com/user-attachments/assets/cb0dcfb9-a9ce-46cd-a12c-a5bd2ddfb0e7" />
<img width="2432" height="1436" alt="image" src="https://github.com/user-attachments/assets/9b7a3d05-8ddd-4464-b420-02108d368277" />
<img width="2294" height="1650" alt="image" src="https://github.com/user-attachments/assets/720ae45e-685f-4aff-a90a-59ef37089ac1" />


# SplitLend Workspace

Privacy-oriented lending prototype workspace with three apps:

- `karma-lending/`: Foundry contracts and deployment scripts
- `backend/`: NestJS backend for quotes, split-plan verification, relayed execution, and position indexing
- `frontend/`: Next.js frontend for the owner `A` and borrower-wallet `B` flows

## Workspace layout

```text
status_buidl/
├─ karma-lending/
├─ backend/
└─ frontend/
```

## Architecture

```mermaid
flowchart LR

subgraph USER["User Layer"]
A["Owner Wallet A<br/>MetaMask"]
B["Borrower Wallet B<br/>Random EOA / MetaMask import"]
ANY["Anyone"]
end

subgraph INTERFACE["Interface"]
FE["Frontend<br/>Next.js"]
end

subgraph BACKEND["Backend"]
BE["Backend API<br/>Policy + Relayer"]
DB1[("split_plan_records<br/>signed plan history")]
DB2[("position_state_records<br/>offchain projection")]
DB3[("borrow_intent_records<br/>borrow success log")]
end

subgraph ONCHAIN["Blockchain"]
LC["KarmaSessionLending"]
CT["Collateral Token mETH"]
DT["Debt Token mDAI"]
OR[(Price Oracle)]
end

A -->|Connect wallet| FE
FE -->|Fetch owner policy| BE
BE -->|Policy and limits| FE

FE -->|Generate random B wallets| B
A -->|Sign split plan| FE
FE -->|Store signed plan| BE
BE --> DB1

A -->|approve mETH| CT
A -->|deposit owner collateral| LC
FE -->|submit prepared split plan| BE
BE -->|allocate collateral to borrowers| LC
LC -->|emit allocation events| BE
BE --> DB1
BE --> DB2

FE -->|Load linked B wallets| BE
BE -->|owner linked position list| FE
FE -->|read position state and LTV| LC
LC -->|live position state| FE

FE -->|borrow preview| BE
BE -->|check owner-B link and policy| BE
FE -->|borrow execute| BE
BE -->|relay borrow| LC
LC -->|transfer mDAI| B
LC -->|emit borrow event| BE
BE --> DB3
BE --> DB2

A -->|approve mDAI and repay| DT
A -->|repay borrower B debt| LC
B -->|approve mDAI and repay| DT
B -->|repay borrower B debt| LC
ANY -->|approve mDAI and repay| DT
ANY -->|repay borrower B debt| LC
LC -->|emit repay event| BE
BE --> DB2

A -->|Sign withdraw authorization| FE
FE -->|user signature and request| BE
BE -->|relay withdraw| LC
LC -->|return collateral| A
LC -->|emit withdraw event| BE
BE --> DB2

LC -->|Check LTV| OR
ANY -->|liquidate| LC
LC -->|emit liquidation event| BE
BE --> DB2

classDef user fill:#E3F2FD,stroke:#1E88E5;
classDef backend fill:#FFF3E0,stroke:#FB8C00;
classDef contract fill:#E8F5E9,stroke:#43A047;
classDef db fill:#F3E5F5,stroke:#8E24AA;

class A,B,ANY user;
class BE backend;
class LC,CT,DT contract;
class DB1,DB2,DB3 db;
```

## Deposit flow

```mermaid
sequenceDiagram
  participant A as Owner A
  participant FE as Frontend
  participant BE as Backend
  participant LC as KarmaSessionLending
  participant CT as Collateral Token

  A->>FE: Connect wallet A
  FE->>BE: Fetch owner policy
  BE-->>FE: Policy and limits

  A->>FE: Enter target borrow amount
  FE->>BE: Request quote
  BE-->>FE: Required collateral and quote

  FE->>FE: Generate random B wallets
  A->>FE: Sign split plan
  FE-->>FE: Store prepared split plan

  A->>CT: Approve collateral
  A->>LC: Deposit owner collateral
  FE->>BE: Submit signed split plan
  BE->>LC: Allocate collateral to B wallets

  LC-->>BE: Allocation event
  BE-->>FE: Allocation success
  FE-->>A: Deposit flow completed
```

## Local run order

1. Start Anvil in `karma-lending/`
2. Start Postgres in `backend/`
3. Deploy contracts from `karma-lending/`
4. Fill `backend/.env`
5. Fill `frontend/.env.local`
6. Run backend with `npm run start:dev`
7. Run frontend with `npm run dev`

## Testing with another owner

If you want to test with an additional owner account instead of the default Anvil account `(0)`:

1. In MetaMask, create a new account.
2. Copy the new account address.
3. Fund that address with enough gas ETH and both local test tokens.

The local setup uses three test assets for convenience:

- `ETH`: gas for direct wallet transactions
- `mETH`: mock collateral token used for deposit
- `mDAI`: mock debt token used for repay tests

Run the commands below from `karma-lending/` and replace `<NEW_OWNER_ADDRESS>` with the MetaMask account you created.

```sh
cast send <NEW_OWNER_ADDRESS> \
  --value 100ether \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://127.0.0.1:8545
```

```sh
cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "mint(address,uint256)" \
  <NEW_OWNER_ADDRESS> \
  1000000000000000000000000 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://127.0.0.1:8545
```

```sh
cast send 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "mint(address,uint256)" \
  <NEW_OWNER_ADDRESS> \
  1000000000000000000000000 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://127.0.0.1:8545
```

After that, connect the new MetaMask account in the frontend and use it as owner `A`.

## App guides

- Contracts: [karma-lending/README.md](/Users/jeong-yoonho/vscode/status_buidl/karma-lending/README.md)
- Backend: [backend/README.md](/Users/jeong-yoonho/vscode/status_buidl/backend/README.md)
- Frontend: [frontend/README.md](/Users/jeong-yoonho/vscode/status_buidl/frontend/README.md)
