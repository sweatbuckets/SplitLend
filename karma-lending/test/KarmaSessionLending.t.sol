// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

import "../src/KarmaSessionLending.sol";
import "../src/MockERC20.sol";

contract KarmaSessionLendingTest is Test {
    MockERC20 internal collateral;
    MockERC20 internal debt;
    KarmaSessionLending internal lending;

    uint256 internal backendPk = 0xBEEF;
    address internal backend;

    uint256[3] internal ownerPks = [uint256(0xA11CE), uint256(0xA22CE), uint256(0xA33CE)];
    address[3] internal owners;

    address[6] internal borrowers;

    function setUp() external {
        backend = vm.addr(backendPk);

        collateral = new MockERC20("Mock ETH", "mETH");
        debt = new MockERC20("Mock DAI", "mDAI");
        lending = new KarmaSessionLending(address(collateral), address(debt), backend);

        debt.mint(address(lending), 1_000_000 ether);

        owners[0] = vm.addr(ownerPks[0]);
        owners[1] = vm.addr(ownerPks[1]);
        owners[2] = vm.addr(ownerPks[2]);

        for (uint256 i = 0; i < owners.length; ++i) {
            collateral.mint(owners[i], 1_000 ether);
        }

        borrowers[0] = vm.addr(0xB101);
        borrowers[1] = vm.addr(0xB102);
        borrowers[2] = vm.addr(0xB201);
        borrowers[3] = vm.addr(0xB202);
        borrowers[4] = vm.addr(0xB301);
        borrowers[5] = vm.addr(0xB302);
    }

    function testAllocateThreeOwnersIntoSixBorrowerPositions() external {
        _depositAndAllocate(
            owners[0],
            _sliceBorrowers(0),
            _sliceAmounts(300 ether, 200 ether),
            bytes32("nonce-owner-1")
        );
        _depositAndAllocate(
            owners[1],
            _sliceBorrowers(2),
            _sliceAmounts(250 ether, 150 ether),
            bytes32("nonce-owner-2")
        );
        _depositAndAllocate(
            owners[2],
            _sliceBorrowers(4),
            _sliceAmounts(125 ether, 175 ether),
            bytes32("nonce-owner-3")
        );

        _assertPosition(borrowers[0], 300 ether, 0);
        _assertPosition(borrowers[1], 200 ether, 0);
        _assertPosition(borrowers[2], 250 ether, 0);
        _assertPosition(borrowers[3], 150 ether, 0);
        _assertPosition(borrowers[4], 125 ether, 0);
        _assertPosition(borrowers[5], 175 ether, 0);

        assertEq(lending.totalUnallocatedCollateral(), 0);

        (uint256 collateral0, uint256 debt0, bool exists0) = lending.getPosition(borrowers[0]);
        assertEq(collateral0, 300 ether);
        assertEq(debt0, 0);
        assertTrue(exists0);
    }

    function testAllocationLogsDoNotDirectlyRevealOwnerToBorrowerLinks() external {
        address[] memory ownerBorrowers = _sliceBorrowers(0);
        uint256[] memory amounts = _sliceAmounts(300 ether, 200 ether);
        bytes32 allocationId = bytes32("nonce-privacy-check");

        vm.startPrank(owners[0]);
        collateral.approve(address(lending), 500 ether);
        lending.depositOwnerCollateral(500 ether);
        vm.stopPrank();

        vm.recordLogs();

        vm.prank(backend);
        lending.allocateCollateralToBorrowers(
            ownerBorrowers,
            amounts,
            allocationId
        );

        Vm.Log[] memory entries = vm.getRecordedLogs();
        bytes32 expectedTopic0 = keccak256("CollateralAllocated(address,uint256)");
        bytes32 depositTopic0 = keccak256("OwnerCollateralDeposited(uint256,uint256)");

        uint256 matchCount = 0;
        for (uint256 i = 0; i < entries.length; ++i) {
            assertTrue(entries[i].topics[0] != depositTopic0, "deposit event should not index owner");

            if (entries[i].topics.length == 2 && entries[i].topics[0] == expectedTopic0) {
                address borrower = address(uint160(uint256(entries[i].topics[1])));
                assertTrue(
                    borrower == ownerBorrowers[0] || borrower == ownerBorrowers[1],
                    "unexpected borrower in allocation log"
                );
                ++matchCount;
            }
        }

        assertEq(
            matchCount,
            2,
            "allocation logs should expose borrower positions only"
        );
    }

    function _depositAndAllocate(
        address owner_,
        address[] memory ownerBorrowers,
        uint256[] memory amounts,
        bytes32 nonce
    ) internal {
        uint256 totalCollateral = amounts[0] + amounts[1];

        vm.startPrank(owner_);
        collateral.approve(address(lending), totalCollateral);
        lending.depositOwnerCollateral(totalCollateral);
        vm.stopPrank();

        vm.prank(backend);
        lending.allocateCollateralToBorrowers(
            ownerBorrowers,
            amounts,
            nonce
        );
    }

    function _sliceBorrowers(uint256 start) internal view returns (address[] memory result) {
        result = new address[](2);
        result[0] = borrowers[start];
        result[1] = borrowers[start + 1];
    }

    function _sliceAmounts(uint256 first, uint256 second)
        internal
        pure
        returns (uint256[] memory result)
    {
        result = new uint256[](2);
        result[0] = first;
        result[1] = second;
    }

    function _assertPosition(address borrower, uint256 expectedCollateral, uint256 expectedDebt)
        internal
        view
    {
        (uint256 collateralAmount, uint256 debtAmount, bool exists) = lending.getPosition(
            borrower
        );
        assertEq(collateralAmount, expectedCollateral);
        assertEq(debtAmount, expectedDebt);
        assertTrue(exists);
    }
}
