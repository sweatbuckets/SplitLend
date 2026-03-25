import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { DelegationService } from "../delegation/delegation.service";
import { BorrowIntentRecord } from "../persistence/entities/borrow-intent-record.entity";
import { PositionIndexerService } from "../indexer/position-indexer.service";
import { PositionStateRecord } from "../persistence/entities/position-state-record.entity";
import { lendingAbi } from "../viem/contracts";
import { CreateBorrowPreviewDto } from "./dto/create-borrow-preview.dto";
import { CreateLiquidationPreviewDto } from "./dto/create-liquidation-preview.dto";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateWithdrawPreviewDto } from "./dto/create-withdraw-preview.dto";
import { ExecuteBorrowDto } from "./dto/execute-borrow.dto";
import { ExecuteWithdrawDto } from "./dto/execute-withdraw.dto";

@Injectable()
export class LoanService {
  private readonly backendAccount: ReturnType<typeof privateKeyToAccount>;
  private readonly walletClient: ReturnType<typeof createWalletClient>;
  private readonly publicClient: ReturnType<typeof createPublicClient>;

  constructor(
    private readonly configService: ConfigService,
    private readonly delegationService: DelegationService,
    private readonly positionIndexerService: PositionIndexerService,
    @InjectRepository(BorrowIntentRecord)
    private readonly borrowIntentRepository: Repository<BorrowIntentRecord>,
    @InjectRepository(PositionStateRecord)
    private readonly positionStateRepository: Repository<PositionStateRecord>
  ) {
    this.backendAccount = privateKeyToAccount(
      this.configService.getOrThrow<`0x${string}`>("TRUSTED_BACKEND_PRIVATE_KEY")
    );
    this.walletClient = createWalletClient({
      account: this.backendAccount,
      transport: http(this.configService.getOrThrow<string>("RPC_URL"))
    });
    this.publicClient = createPublicClient({
      transport: http(this.configService.getOrThrow<string>("RPC_URL"))
    });
  }

  getOwnerPolicy(owner: string) {
    const policy = this.resolveOwnerPolicy(owner);

    return {
      owner,
      policyName: policy.policyName,
      maxLtvBps: policy.maxLtvBps.toString(),
      collateralRatioBps: policy.collateralRatioBps.toString(),
      liquidationLtvBps: policy.liquidationLtvBps.toString()
    };
  }

  createQuote(dto: CreateQuoteDto) {
    const policy = this.resolveOwnerPolicy(dto.owner);
    const borrowAmount = BigInt(dto.requestedBorrowAmount);
    if (borrowAmount <= 0n) {
      throw new BadRequestException("Borrow amount must be greater than zero");
    }

    const collateralRequired = (borrowAmount * policy.collateralRatioBps) / 10000n;
    const quoteExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    return {
      owner: dto.owner,
      policyName: policy.policyName,
      borrowAmount: borrowAmount.toString(),
      collateralRequired: collateralRequired.toString(),
      ltvBps: Number(policy.maxLtvBps),
      liquidationLtvBps: Number(policy.liquidationLtvBps),
      quoteExpiresAt: Math.floor(quoteExpiresAt.getTime() / 1000).toString()
    };
  }

  async createBorrowPreview(dto: CreateBorrowPreviewDto) {
    if (BigInt(dto.borrowAmount) <= 0n) {
      throw new BadRequestException("Borrow amount must be greater than zero");
    }

    const { borrowerAllocation } = await this.delegationService.getLatestSplitPlanLinkForBorrowerOrThrow(
      dto.owner,
      dto.borrowerWallet
    );

    const policy = this.resolveOwnerPolicy(dto.owner);
    const position = await this.readBorrowerPosition(dto.borrowerWallet);
    const maxBorrowByCollateral = (position.collateral * policy.maxLtvBps) / 10000n;
    const remainingBorrowCapacity =
      maxBorrowByCollateral > position.debt ? maxBorrowByCollateral - position.debt : 0n;

    if (BigInt(dto.borrowAmount) > remainingBorrowCapacity) {
      throw new BadRequestException("Borrow amount exceeds the borrower wallet capacity");
    }

    return {
      owner: dto.owner,
      borrowerWallet: dto.borrowerWallet,
      borrowerAllocation,
      currentCollateral: position.collateral.toString(),
      currentDebt: position.debt.toString(),
      policyLtvBps: policy.maxLtvBps.toString(),
      maxBorrow: maxBorrowByCollateral.toString(),
      receiver: dto.borrowerWallet
    };
  }

  async createWithdrawPreview(dto: CreateWithdrawPreviewDto) {
    const withdrawAmount = BigInt(dto.withdrawAmount);
    if (withdrawAmount <= 0n) {
      throw new BadRequestException("Withdraw amount must be greater than zero");
    }

    await this.delegationService.getLatestSplitPlanLinkForBorrowerOrThrow(dto.owner, dto.borrowerWallet);

    const position = await this.readBorrowerPosition(dto.borrowerWallet);
    const liquidationLtvBps = await this.readLiquidationLtvBps();
    if (withdrawAmount > position.collateral) {
      throw new BadRequestException("Withdraw amount exceeds borrower wallet collateral");
    }

    const remainingCollateral = position.collateral - withdrawAmount;
    const resultingLtvBps =
      position.debt === 0n
        ? 0n
        : remainingCollateral === 0n
          ? 1000000n
          : (position.debt * 10000n) / remainingCollateral;

    const allowed =
      position.debt === 0n
        ? true
        : remainingCollateral > 0n && resultingLtvBps < liquidationLtvBps;

    let maxWithdrawAmount = position.collateral;
    if (position.debt > 0n) {
      const minimumCollateralToStaySafe =
        (position.debt * 10000n + liquidationLtvBps - 1n) / liquidationLtvBps;
      maxWithdrawAmount =
        position.collateral > minimumCollateralToStaySafe
          ? position.collateral - minimumCollateralToStaySafe
          : 0n;
    }

    return {
      borrowerWallet: dto.borrowerWallet,
      owner: dto.owner,
      withdrawAmount: dto.withdrawAmount,
      maxWithdrawAmount: maxWithdrawAmount.toString(),
      currentCollateral: position.collateral.toString(),
      currentDebt: position.debt.toString(),
      remainingCollateral: remainingCollateral.toString(),
      resultingLtvBps: resultingLtvBps.toString(),
      liquidationLtvBps: liquidationLtvBps.toString(),
      allowed
    };
  }

  async createLiquidationPreview(dto: CreateLiquidationPreviewDto) {
    const repayAmount = BigInt(dto.repayAmount);
    if (repayAmount <= 0n) {
      throw new BadRequestException("Repay amount must be greater than zero");
    }

    const position = await this.readBorrowerPosition(dto.borrowerWallet);
    if (position.debt === 0n) {
      throw new BadRequestException("Borrower wallet has no debt");
    }

    const lendingAddress = this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS");
    const [currentLtvBps, liquidationLtvBps, liquidationBonusBps, targetLtvAfterLiquidationBps] =
      await Promise.all([
        this.publicClient.readContract({
          address: lendingAddress,
          abi: lendingAbi,
          functionName: "currentLtvBps",
          args: [dto.borrowerWallet as `0x${string}`]
        }),
        this.publicClient.readContract({
          address: lendingAddress,
          abi: lendingAbi,
          functionName: "liquidationLtvBps",
          args: []
        }),
        this.publicClient.readContract({
          address: lendingAddress,
          abi: lendingAbi,
          functionName: "liquidationBonusBps",
          args: []
        }),
        this.publicClient.readContract({
          address: lendingAddress,
          abi: lendingAbi,
          functionName: "targetLtvAfterLiquidationBps",
          args: []
        })
      ]);

    const liquidatable = currentLtvBps >= liquidationLtvBps;
    const bonusFactorBps = 10000n + liquidationBonusBps;
    const denominatorBps = 10000n - ((targetLtvAfterLiquidationBps * bonusFactorBps) / 10000n);

    let suggestedRepay = 0n;
    if (liquidatable) {
      if (denominatorBps === 0n) {
        suggestedRepay = position.debt;
      } else {
        const targetDebtComponent = (targetLtvAfterLiquidationBps * position.collateral) / 10000n;
        if (position.debt > targetDebtComponent) {
          const numerator = position.debt - targetDebtComponent;
          suggestedRepay = (numerator * 10000n + denominatorBps - 1n) / denominatorBps;
        }
      }
    }

    let actualRepay = suggestedRepay === 0n ? repayAmount : suggestedRepay;
    if (actualRepay > repayAmount) actualRepay = repayAmount;
    if (actualRepay > position.debt) actualRepay = position.debt;

    let collateralSeized = (actualRepay * bonusFactorBps) / 10000n;
    if (collateralSeized > position.collateral) {
      collateralSeized = position.collateral;
    }

    return {
      borrowerWallet: dto.borrowerWallet,
      currentCollateral: position.collateral.toString(),
      currentDebt: position.debt.toString(),
      currentLtvBps: currentLtvBps.toString(),
      liquidationLtvBps: liquidationLtvBps.toString(),
      liquidationBonusBps: liquidationBonusBps.toString(),
      targetLtvAfterLiquidationBps: targetLtvAfterLiquidationBps.toString(),
      liquidatable,
      requestedRepayAmount: dto.repayAmount,
      suggestedRepayAmount: suggestedRepay.toString(),
      actualRepayAmount: actualRepay.toString(),
      estimatedCollateralSeized: collateralSeized.toString()
    };
  }

  async executeBorrow(dto: ExecuteBorrowDto) {
    const borrowAmount = BigInt(dto.borrowAmount);
    if (borrowAmount <= 0n) {
      throw new BadRequestException("Borrow amount must be greater than zero");
    }

    await this.delegationService.getLatestSplitPlanLinkForBorrowerOrThrow(dto.owner, dto.borrowerWallet);

    const position = await this.readBorrowerPosition(dto.borrowerWallet);
    const policy = this.resolveOwnerPolicy(dto.owner);
    const maxBorrowByCollateral = (position.collateral * policy.maxLtvBps) / 10000n;
    const remainingBorrowCapacity =
      maxBorrowByCollateral > position.debt ? maxBorrowByCollateral - position.debt : 0n;

    if (borrowAmount > remainingBorrowCapacity) {
      throw new BadRequestException("Borrow amount exceeds the borrower wallet capacity");
    }

    const nonce = keccak256(
      stringToHex(`${dto.owner}:${dto.borrowerWallet}:${dto.borrowAmount}:${dto.receiver}:${Date.now()}`)
    );
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const backendSignature = await this.walletClient.signTypedData({
      account: this.backendAccount,
      domain: {
        name: "KarmaSessionLending",
        version: "1",
        chainId: Number(this.configService.getOrThrow<string>("CHAIN_ID")),
        verifyingContract: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS")
      },
      primaryType: "BorrowApproval",
      types: {
        BorrowApproval: [
          { name: "borrowerWallet", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "maxBorrow", type: "uint256" },
          { name: "receiver", type: "address" },
          { name: "expiresAt", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      message: {
        borrowerWallet: dto.borrowerWallet as `0x${string}`,
        amount: borrowAmount,
        maxBorrow: maxBorrowByCollateral,
        receiver: dto.receiver as `0x${string}`,
        expiresAt: BigInt(Math.floor(expiresAt.getTime() / 1000)),
        nonce: nonce as `0x${string}`
      }
    });

    const txHash = await this.walletClient.writeContract({
      account: this.backendAccount,
      address: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS"),
      abi: lendingAbi,
      functionName: "borrow",
      args: [
        dto.borrowerWallet as `0x${string}`,
        borrowAmount,
        maxBorrowByCollateral,
        dto.receiver as `0x${string}`,
        BigInt(Math.floor(expiresAt.getTime() / 1000)),
        nonce as `0x${string}`,
        backendSignature
      ],
      chain: undefined
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new BadRequestException("Borrow transaction reverted");
    }

    const record = this.borrowIntentRepository.create({
      owner: dto.owner,
      borrowerWallet: dto.borrowerWallet,
      receiver: dto.receiver,
      borrowAmount: dto.borrowAmount,
      txHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      nonce,
      expiresAt
    });

    await this.borrowIntentRepository.save(record);
    await this.positionIndexerService.syncThroughBlock(receipt.blockNumber);

    return {
      txHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      borrowerWallet: dto.borrowerWallet,
      borrowAmount: dto.borrowAmount,
      receiver: dto.receiver
    };
  }

  async executeWithdraw(dto: ExecuteWithdrawDto) {
    const withdrawAmount = BigInt(dto.withdrawAmount);
    if (withdrawAmount <= 0n) {
      throw new BadRequestException("Withdraw amount must be greater than zero");
    }

    const expiresAt = BigInt(dto.expiresAt);
    if (expiresAt <= BigInt(Math.floor(Date.now() / 1000))) {
      throw new BadRequestException("Withdraw signature already expired");
    }

    await this.delegationService.getLatestSplitPlanLinkForBorrowerOrThrow(dto.owner, dto.borrowerWallet);

    const position = await this.readBorrowerPosition(dto.borrowerWallet);
    if (withdrawAmount > position.collateral) {
      throw new BadRequestException("Withdraw amount exceeds borrower wallet collateral");
    }

    const liquidationLtvBps = await this.readLiquidationLtvBps();
    const remainingCollateral = position.collateral - withdrawAmount;
    const resultingLtvBps =
      position.debt === 0n
        ? 0n
        : remainingCollateral === 0n
          ? 1000000n
          : (position.debt * 10000n) / remainingCollateral;

    const allowed =
      position.debt === 0n ? true : remainingCollateral > 0n && resultingLtvBps < liquidationLtvBps;

    if (!allowed) {
      throw new BadRequestException("Withdraw would exceed the liquidation threshold");
    }

    const ownerSignatureValid = await this.verifyOwnerWithdrawSignature(dto, expiresAt);
    if (!ownerSignatureValid) {
      throw new BadRequestException("Invalid withdraw owner signature");
    }

    const backendSignature = await this.walletClient.signTypedData({
      account: this.backendAccount,
      domain: {
        name: "KarmaSessionLending",
        version: "1",
        chainId: Number(this.configService.getOrThrow<string>("CHAIN_ID")),
        verifyingContract: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS")
      },
      primaryType: "WithdrawAuthorization",
      types: {
        WithdrawAuthorization: [
          { name: "owner", type: "address" },
          { name: "borrowerWallet", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "to", type: "address" },
          { name: "expiresAt", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      message: {
        owner: dto.owner as `0x${string}`,
        borrowerWallet: dto.borrowerWallet as `0x${string}`,
        amount: withdrawAmount,
        to: dto.to as `0x${string}`,
        expiresAt,
        nonce: dto.nonce as `0x${string}`
      }
    });

    const txHash = await this.walletClient.writeContract({
      account: this.backendAccount,
      address: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS"),
      abi: lendingAbi,
      functionName: "withdraw",
      args: [
        dto.owner as `0x${string}`,
        dto.borrowerWallet as `0x${string}`,
        withdrawAmount,
        dto.to as `0x${string}`,
        expiresAt,
        dto.nonce as `0x${string}`,
        dto.ownerSignature as `0x${string}`,
        backendSignature
      ],
      chain: undefined
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    await this.positionIndexerService.syncThroughBlock(receipt.blockNumber);

    return {
      txHash,
      backendSignature,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      withdrawAmount: withdrawAmount.toString(),
      to: dto.to,
      borrowerWallet: dto.borrowerWallet
    };
  }

  async syncPositionStateByBorrower(borrowerWallet: string) {
    await this.positionIndexerService.syncToLatest();
    const record = await this.positionStateRepository.findOne({
      where: {
        borrowerWallet
      }
    });

    if (!record) {
      throw new BadRequestException("Borrower wallet position does not exist");
    }

    return {
      owner: record.owner,
      borrowerWallet: record.borrowerWallet,
      collateral: record.collateral,
      debt: record.debt,
      currentLtvBps: record.currentLtvBps,
      liquidationLtvBps: record.liquidationLtvBps,
      lastSyncedBlockNumber: record.lastSyncedBlockNumber
    };
  }

  private async readBorrowerPosition(borrowerWallet: string) {
    const position = await this.publicClient.readContract({
      address: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS"),
      abi: lendingAbi,
      functionName: "positions",
      args: [borrowerWallet as `0x${string}`]
    });

    if (!position[2]) {
      throw new BadRequestException("Borrower wallet position does not exist");
    }

    return {
      collateral: position[0],
      debt: position[1]
    };
  }

  private async readLiquidationLtvBps() {
    return this.publicClient.readContract({
      address: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS"),
      abi: lendingAbi,
      functionName: "liquidationLtvBps",
      args: []
    });
  }

  private verifyOwnerWithdrawSignature(dto: ExecuteWithdrawDto, expiresAt: bigint) {
    return verifyTypedData({
      address: dto.owner as `0x${string}`,
      domain: {
        name: "KarmaSessionLending",
        version: "1",
        chainId: Number(this.configService.getOrThrow<string>("CHAIN_ID")),
        verifyingContract: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS")
      },
      primaryType: "WithdrawAuthorization",
      types: {
        WithdrawAuthorization: [
          { name: "owner", type: "address" },
          { name: "borrowerWallet", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "to", type: "address" },
          { name: "expiresAt", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      message: {
        owner: dto.owner as `0x${string}`,
        borrowerWallet: dto.borrowerWallet as `0x${string}`,
        amount: BigInt(dto.withdrawAmount),
        to: dto.to as `0x${string}`,
        expiresAt,
        nonce: dto.nonce as `0x${string}`
      },
      signature: dto.ownerSignature as `0x${string}`
    });
  }

  private resolveOwnerPolicy(owner: string) {
    const normalizedOwner = owner.toLowerCase();

    if (normalizedOwner === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266") {
      return {
        policyName: "Karma Basic",
        maxLtvBps: 6667n,
        collateralRatioBps: 15000n,
        liquidationLtvBps: 8000n
      };
    }

    return {
      policyName: "Karma Basic",
      maxLtvBps: 6667n,
      collateralRatioBps: 15000n,
      liquidationLtvBps: 8000n
    };
  }
}
