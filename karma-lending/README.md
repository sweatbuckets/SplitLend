# Karma Lending Contracts

Foundry package for the privacy lending prototype contracts.

## Contracts

- `src/KarmaSessionLending.sol`
  - owner collateral deposit
  - collateral allocation to borrower wallets `B`
  - relayed borrow
  - permissionless repay
  - relayed withdraw
  - liquidation
- `src/MockERC20.sol`
  - local test collateral / debt token

## Local development

### Build

```sh
forge build
```

### Test

```sh
forge test
```

### Run Anvil

```sh
anvil
```

### Deploy

```sh
PRIVATE_KEY=<anvil account(0) private key> \
TRUSTED_BACKEND=<anvil account(1) address> \
forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

## Deployment behavior

The deploy script:

- deploys `MockERC20` collateral and debt tokens
- deploys `KarmaSessionLending`
- seeds lending-side debt-token liquidity
- mints test collateral to the deployer

## Related apps in this workspace

- Backend guide: [backend/README.md](/Users/jeong-yoonho/vscode/status_buidl/backend/README.md)
- Frontend guide: [frontend/README.md](/Users/jeong-yoonho/vscode/status_buidl/frontend/README.md)
