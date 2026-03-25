// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockERC20.sol";
import "../src/KarmaSessionLending.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustedBackend = vm.envOr("TRUSTED_BACKEND", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy test collateral/debt tokens.
        MockERC20 collateral = new MockERC20("Mock ETH", "mETH");
        MockERC20 debt = new MockERC20("Mock DAI", "mDAI");

        // 2. Deploy lending with an explicit backend relayer address.
        KarmaSessionLending lending = new KarmaSessionLending(
            address(collateral),
            address(debt),
            trustedBackend
        );

        // 3. Seed debt-token liquidity for borrow tests.
        debt.mint(address(lending), 1_000_000 ether);

        // 4. Fund the deployer generously so local deposit and repay flows do not block tests.
        collateral.mint(vm.addr(deployerPrivateKey), 1_000_000 ether);
        debt.mint(vm.addr(deployerPrivateKey), 1_000_000 ether);

        vm.stopBroadcast();

        console2.log("Collateral token:", address(collateral));
        console2.log("Debt token:", address(debt));
        console2.log("KarmaSessionLending:", address(lending));
        console2.log("Trusted backend:", trustedBackend);
    }
}
