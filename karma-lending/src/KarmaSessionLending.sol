// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != _ENTERED, "REENTRANCY");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract KarmaSessionLending is ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------
    error InvalidBackendSignature();
    error SignatureExpired();
    error NonceAlreadyUsed();
    error PositionNotFound();
    error ZeroAmount();
    error Unauthorized();
    error BorrowExceedsApprovedLimit();
    error InsufficientLiquidity();
    error HealthyPosition();
    error TransferFailed();
    error NotOwner();
    error ZeroAddress();
    error NoDebt();
    error InsufficientCollateral();
    error LtvTooHigh();
    error OnlyRelayer();
    error InvalidBorrowerWallet();
    error ArrayLengthMismatch();
    error InsufficientUnallocatedCollateral();
    error DuplicateBorrowerWallet();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    event OwnerCollateralDeposited(
        uint256 amount,
        uint256 unallocatedCollateral
    );

    event CollateralAllocated(
        address indexed borrowerWallet,
        uint256 amount
    );

    event Borrowed(
        address indexed borrowerWallet,
        address indexed receiver,
        uint256 amount,
        uint256 approvedMaxBorrow
    );

    event Repaid(
        address indexed borrowerWallet,
        address indexed payer,
        uint256 amount
    );

    event Withdrawn(
        address indexed borrowerWallet,
        address indexed to,
        uint256 amount
    );

    event Liquidated(
        address indexed borrowerWallet,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized
    );

    event TrustedBackendUpdated(address indexed oldBackend, address indexed newBackend);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);
    event LiquidationParamsUpdated(
        uint256 liquidationLtvBps,
        uint256 liquidationBonusBps,
        uint256 targetLtvAfterLiquidationBps
    );

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------
    struct Position {
        uint256 collateral; // stETH-like token amount
        uint256 debt;       // sDAI-like token amount
        bool exists;
    }

    IERC20 public immutable collateralToken;
    IERC20 public immutable debtToken;

    address public owner;
    address public trustedBackend;

    // MVP 1:1 valuation assumption.
    // Production should replace with oracle-based value normalization.
    uint256 public liquidationLtvBps = 8000;            // 80%
    uint256 public liquidationBonusBps = 500;           // 5%
    uint256 public targetLtvAfterLiquidationBps = 7000; // 70%

    mapping(address => Position) public positions;
    mapping(bytes32 => bool) public usedBorrowNonces;
    mapping(bytes32 => bool) public usedSplitPlanNonces;
    uint256 public totalUnallocatedCollateral;

    // -------------------------------------------------------------------------
    // EIP-712
    // -------------------------------------------------------------------------
    bytes32 private immutable _DOMAIN_SEPARATOR;
    uint256 private immutable _INITIAL_CHAIN_ID;

    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    bytes32 private constant _BORROW_APPROVAL_TYPEHASH =
        keccak256(
            "BorrowApproval(address borrowerWallet,uint256 amount,uint256 maxBorrow,address receiver,uint256 expiresAt,bytes32 nonce)"
        );
    bytes32 private constant _WITHDRAW_AUTHORIZATION_TYPEHASH =
        keccak256(
            "WithdrawAuthorization(address owner,address borrowerWallet,uint256 amount,address to,uint256 expiresAt,bytes32 nonce)"
        );

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------
    constructor(
        address _collateralToken,
        address _debtToken,
        address _trustedBackend
    ) {
        if (_collateralToken == address(0)) revert ZeroAddress();
        if (_debtToken == address(0)) revert ZeroAddress();
        if (_trustedBackend == address(0)) revert ZeroAddress();

        collateralToken = IERC20(_collateralToken);
        debtToken = IERC20(_debtToken);
        trustedBackend = _trustedBackend;
        owner = msg.sender;

        _INITIAL_CHAIN_ID = block.chainid;
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                _EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("KarmaSessionLending")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------
    function setTrustedBackend(address newBackend) external onlyOwner {
        if (newBackend == address(0)) revert ZeroAddress();
        emit TrustedBackendUpdated(trustedBackend, newBackend);
        trustedBackend = newBackend;
    }

    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    function setLiquidationParams(
        uint256 newLiquidationLtvBps,
        uint256 newLiquidationBonusBps,
        uint256 newTargetLtvAfterLiquidationBps
    ) external onlyOwner {
        require(newLiquidationLtvBps > 0 && newLiquidationLtvBps <= 10000, "BAD_LTV");
        require(newLiquidationBonusBps <= 3000, "BONUS_TOO_HIGH");
        require(
            newTargetLtvAfterLiquidationBps < newLiquidationLtvBps,
            "TARGET_MUST_BE_LOWER"
        );

        liquidationLtvBps = newLiquidationLtvBps;
        liquidationBonusBps = newLiquidationBonusBps;
        targetLtvAfterLiquidationBps = newTargetLtvAfterLiquidationBps;

        emit LiquidationParamsUpdated(
            newLiquidationLtvBps,
            newLiquidationBonusBps,
            newTargetLtvAfterLiquidationBps
        );
    }

    // -------------------------------------------------------------------------
    // Core: Owner deposits collateral, then allocates it to borrower-wallet positions
    // -------------------------------------------------------------------------
    function depositOwnerCollateral(uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();

        totalUnallocatedCollateral += amount;

        bool ok = collateralToken.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        emit OwnerCollateralDeposited(
            amount,
            totalUnallocatedCollateral
        );
    }

    function allocateCollateralToBorrowers(
        address[] calldata borrowerWallets,
        uint256[] calldata amounts,
        bytes32 allocationId
    )
        external
        nonReentrant
    {
        if (msg.sender != trustedBackend) revert OnlyRelayer();
        if (borrowerWallets.length != amounts.length) revert ArrayLengthMismatch();
        if (borrowerWallets.length == 0) revert ArrayLengthMismatch();
        if (usedSplitPlanNonces[allocationId]) revert NonceAlreadyUsed();

        uint256 computedTotal = 0;
        for (uint256 i = 0; i < borrowerWallets.length; ++i) {
            address borrowerWallet = borrowerWallets[i];
            uint256 amount = amounts[i];

            if (borrowerWallet == address(0)) revert ZeroAddress();
            if (amount == 0) revert ZeroAmount();

            for (uint256 j = i + 1; j < borrowerWallets.length; ++j) {
                if (borrowerWallet == borrowerWallets[j]) revert DuplicateBorrowerWallet();
            }

            computedTotal += amount;
        }

        if (totalUnallocatedCollateral < computedTotal) {
            revert InsufficientUnallocatedCollateral();
        }

        usedSplitPlanNonces[allocationId] = true;
        totalUnallocatedCollateral -= computedTotal;

        for (uint256 i = 0; i < borrowerWallets.length; ++i) {
            address borrowerWallet = borrowerWallets[i];
            uint256 amount = amounts[i];
            Position storage p = positions[borrowerWallet];
            if (!p.exists) {
                p.exists = true;
            }
            p.collateral += amount;

            emit CollateralAllocated(borrowerWallet, amount);
        }
    }

    // -------------------------------------------------------------------------
    // Borrow (backend signature + relayer only)
    // -------------------------------------------------------------------------
    function borrow(
        address borrowerWallet,
        uint256 amount,
        uint256 maxBorrow,
        address receiver,
        uint256 expiresAt,
        bytes32 nonce,
        bytes calldata backendSig
    ) external nonReentrant {
        if (msg.sender != trustedBackend) revert OnlyRelayer();
        if (amount == 0) revert ZeroAmount();
        if (borrowerWallet == address(0)) revert ZeroAddress();
        if (receiver == address(0)) revert ZeroAddress();

        Position storage p = positions[borrowerWallet];
        if (!p.exists) revert PositionNotFound();

        if (block.timestamp > expiresAt) revert SignatureExpired();
        if (usedBorrowNonces[nonce]) revert NonceAlreadyUsed();

        _verifyBorrowApproval(
            borrowerWallet,
            amount,
            maxBorrow,
            receiver,
            expiresAt,
            nonce,
            backendSig
        );

        usedBorrowNonces[nonce] = true;

        if (amount > maxBorrow) revert BorrowExceedsApprovedLimit();
        if (p.debt + amount > maxBorrow) revert BorrowExceedsApprovedLimit();

        uint256 newDebt = p.debt + amount;
        uint256 newLtvBps = _ltvBps(newDebt, p.collateral);

        // Borrow should not create an instantly liquidatable position.
        if (newLtvBps >= liquidationLtvBps) revert LtvTooHigh();

        if (debtToken.balanceOf(address(this)) < amount) {
            revert InsufficientLiquidity();
        }

        p.debt = newDebt;

        bool ok = debtToken.transfer(receiver, amount);
        if (!ok) revert TransferFailed();

        emit Borrowed(borrowerWallet, receiver, amount, maxBorrow);
    }

    // -------------------------------------------------------------------------
    // Repay (permissionless)
    // -------------------------------------------------------------------------
    function repay(address borrowerWallet, uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (borrowerWallet == address(0)) revert ZeroAddress();

        Position storage p = positions[borrowerWallet];
        if (!p.exists) revert PositionNotFound();
        if (p.debt == 0) revert NoDebt();

        uint256 payAmount = amount > p.debt ? p.debt : amount;

        bool ok = debtToken.transferFrom(msg.sender, address(this), payAmount);
        if (!ok) revert TransferFailed();

        p.debt -= payAmount;

        emit Repaid(borrowerWallet, msg.sender, payAmount);
    }

    // -------------------------------------------------------------------------
    // Withdraw (owner signature + backend signature + relayer only)
    // -------------------------------------------------------------------------
    function withdraw(
        address owner_,
        address borrowerWallet,
        uint256 amount,
        address to,
        uint256 expiresAt,
        bytes32 nonce,
        bytes calldata ownerSignature,
        bytes calldata backendSignature
    )
        external
        nonReentrant
    {
        if (msg.sender != trustedBackend) revert OnlyRelayer();
        if (owner_ == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (borrowerWallet == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (block.timestamp > expiresAt) revert SignatureExpired();
        if (usedBorrowNonces[nonce]) revert NonceAlreadyUsed();

        Position storage p = positions[borrowerWallet];
        if (!p.exists) revert PositionNotFound();
        if (p.collateral < amount) revert InsufficientCollateral();

        _verifyWithdrawAuthorization(
            owner_,
            borrowerWallet,
            amount,
            to,
            expiresAt,
            nonce,
            ownerSignature,
            backendSignature
        );

        usedBorrowNonces[nonce] = true;

        uint256 remainingCollateral = p.collateral - amount;

        // If debt remains, position must stay below liquidation threshold.
        // remainingCollateral == 0 while debt > 0 is never allowed.
        if (p.debt > 0) {
            if (remainingCollateral == 0) revert LtvTooHigh();

            uint256 newLtv = _ltvBps(p.debt, remainingCollateral);
            if (newLtv >= liquidationLtvBps) revert LtvTooHigh();
        }

        p.collateral = remainingCollateral;

        bool ok = collateralToken.transfer(to, amount);
        if (!ok) revert TransferFailed();

        emit Withdrawn(borrowerWallet, to, amount);
    }

    // -------------------------------------------------------------------------
    // Liquidation (partial, target-LTV based)
    // -------------------------------------------------------------------------
    function liquidate(address borrowerWallet, uint256 repayAmount)
        external
        nonReentrant
    {
        if (repayAmount == 0) revert ZeroAmount();
        if (borrowerWallet == address(0)) revert ZeroAddress();

        Position storage p = positions[borrowerWallet];
        if (!p.exists) revert PositionNotFound();
        if (p.debt == 0) revert NoDebt();

        uint256 currentLtv = _ltvBps(p.debt, p.collateral);
        if (currentLtv < liquidationLtvBps) revert HealthyPosition();

        /*
            MVP 1:1 valuation model.

            We try to repay just enough debt so that after liquidation
            the position is brought back to targetLtvAfterLiquidationBps,
            unless caller asks less, or debt/collateral caps bind.

            Let:
              D = current debt
              C = current collateral
              b = liquidation bonus ratio
              T = targetLtvAfterLiquidationBps / 10000
              x = debt repaid

            After liquidation:
              D' = D - x
              C' = C - x*(1+b)

            Target:
              D' / C' <= T

            Solve for x:
              x >= (D - T*C) / (1 - T*(1+b))
        */

        uint256 bonusFactorBps = 10000 + liquidationBonusBps;
        uint256 denominatorBps = 10000 - ((targetLtvAfterLiquidationBps * bonusFactorBps) / 10000);

        uint256 desiredRepay;
        if (denominatorBps == 0) {
            desiredRepay = p.debt;
        } else {
            uint256 targetDebtComponent = (targetLtvAfterLiquidationBps * p.collateral) / 10000;

            if (p.debt <= targetDebtComponent) {
                desiredRepay = 0;
            } else {
                uint256 numerator = p.debt - targetDebtComponent;
                desiredRepay = (numerator * 10000 + denominatorBps - 1) / denominatorBps; // ceil div
            }
        }

        // bound by caller input and total debt
        uint256 actualRepay = desiredRepay;
        if (actualRepay == 0) {
            actualRepay = repayAmount;
        }
        if (actualRepay > repayAmount) actualRepay = repayAmount;
        if (actualRepay > p.debt) actualRepay = p.debt;

        bool ok = debtToken.transferFrom(msg.sender, address(this), actualRepay);
        if (!ok) revert TransferFailed();

        uint256 collateralSeized =
            (actualRepay * (10000 + liquidationBonusBps)) / 10000;

        if (collateralSeized > p.collateral) {
            collateralSeized = p.collateral;
        }

        p.debt -= actualRepay;
        p.collateral -= collateralSeized;

        ok = collateralToken.transfer(msg.sender, collateralSeized);
        if (!ok) revert TransferFailed();

        emit Liquidated(borrowerWallet, msg.sender, actualRepay, collateralSeized);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------
    function getPosition(address borrowerWallet)
        external
        view
        returns (uint256 collateral, uint256 debt, bool exists)
    {
        Position memory p = positions[borrowerWallet];
        return (p.collateral, p.debt, p.exists);
    }

    function currentLtvBps(address borrowerWallet) external view returns (uint256) {
        Position memory p = positions[borrowerWallet];
        if (!p.exists) revert PositionNotFound();
        return _ltvBps(p.debt, p.collateral);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -------------------------------------------------------------------------
    // Internal: Signature verification
    // -------------------------------------------------------------------------
    function _verifyBorrowApproval(
        address borrowerWallet,
        uint256 amount,
        uint256 maxBorrow,
        address receiver,
        uint256 expiresAt,
        bytes32 nonce,
        bytes calldata signature
    ) internal view {
        bytes32 structHash = keccak256(
            abi.encode(
                _BORROW_APPROVAL_TYPEHASH,
                borrowerWallet,
                amount,
                maxBorrow,
                receiver,
                expiresAt,
                nonce
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
        );

        address recovered = _recoverSigner(digest, signature);
        if (recovered != trustedBackend) revert InvalidBackendSignature();
    }

    function _verifyWithdrawAuthorization(
        address owner_,
        address borrowerWallet,
        uint256 amount,
        address to,
        uint256 expiresAt,
        bytes32 nonce,
        bytes calldata ownerSignature,
        bytes calldata backendSignature
    ) internal view {
        bytes32 structHash = keccak256(
            abi.encode(
                _WITHDRAW_AUTHORIZATION_TYPEHASH,
                owner_,
                borrowerWallet,
                amount,
                to,
                expiresAt,
                nonce
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
        );

        if (_recoverSigner(digest, ownerSignature) != owner_) revert Unauthorized();
        if (_recoverSigner(digest, backendSignature) != trustedBackend) {
            revert InvalidBackendSignature();
        }
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature)
        internal
        pure
        returns (address)
    {
        if (signature.length != 65) revert InvalidBackendSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidBackendSignature();

        return recovered;
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        if (block.chainid == _INITIAL_CHAIN_ID) {
            return _DOMAIN_SEPARATOR;
        }

        return keccak256(
            abi.encode(
                _EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("KarmaSessionLending")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _ltvBps(uint256 debtAmount, uint256 collateralAmount)
        internal
        pure
        returns (uint256)
    {
        if (debtAmount == 0) return 0;
        if (collateralAmount == 0) return type(uint256).max;
        return (debtAmount * 10000) / collateralAmount;
    }
}
