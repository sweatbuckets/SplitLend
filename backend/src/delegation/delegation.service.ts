import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { PositionIndexerService } from "../indexer/position-indexer.service";
import { PositionStateRecord } from "../persistence/entities/position-state-record.entity";
import { SplitPlanRecord } from "../persistence/entities/split-plan-record.entity";
import { lendingAbi } from "../viem/contracts";
import { CreateSplitPlanDto } from "./dto/create-split-plan.dto";

@Injectable()
export class DelegationService {
  private readonly backendAccount: ReturnType<typeof privateKeyToAccount>;
  private readonly walletClient: ReturnType<typeof createWalletClient>;
  private readonly publicClient: ReturnType<typeof createPublicClient>;

  constructor(
    @InjectRepository(SplitPlanRecord)
    private readonly splitPlanRepository: Repository<SplitPlanRecord>,
    @InjectRepository(PositionStateRecord)
    private readonly positionStateRepository: Repository<PositionStateRecord>,
    @Inject(forwardRef(() => PositionIndexerService))
    private readonly positionIndexerService: PositionIndexerService,
    private readonly configService: ConfigService
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

  async createSplitPlan(dto: CreateSplitPlanDto) {
    if (dto.wallets.length !== dto.amounts.length) {
      throw new BadRequestException("Wallet and amount counts must match");
    }

    const uniqueWallets = new Set(dto.wallets.map((wallet) => wallet.toLowerCase()));
    if (uniqueWallets.size !== dto.wallets.length) {
      throw new BadRequestException("Duplicate split wallets are not allowed");
    }

    let normalizedAmounts: bigint[];

    try {
      normalizedAmounts = dto.amounts.map((amount) => BigInt(amount));
    } catch {
      throw new BadRequestException("Split amounts must be valid uint256 strings");
    }

    const totalAmount = normalizedAmounts.reduce((sum, amount) => sum + amount, 0n);
    if (totalAmount <= 0n) {
      throw new BadRequestException("Split plan must allocate positive collateral");
    }

    let normalizedTotalCollateral: bigint;

    try {
      normalizedTotalCollateral = BigInt(dto.totalCollateral);
    } catch {
      throw new BadRequestException("totalCollateral must be a valid uint256 string");
    }

    if (totalAmount !== normalizedTotalCollateral) {
      throw new BadRequestException("Split amount total does not match totalCollateral");
    }

    const expiresAt = new Date(Number(dto.expiresAt) * 1000);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Split plan signature already expired");
    }

    const existingNonce = await this.splitPlanRepository.findOne({
      where: {
        nonce: dto.nonce
      }
    });

    if (existingNonce) {
      throw new BadRequestException("Split plan nonce already used");
    }

    const verified = await verifyTypedData({
      address: dto.owner as `0x${string}`,
      domain: {
        name: this.configService.get<string>("SPLIT_PLAN_SIGNER_NAME", "KarmaLendingSplitPlan"),
        version: this.configService.get<string>("SPLIT_PLAN_SIGNER_VERSION", "1"),
        chainId: Number(this.configService.getOrThrow<string>("CHAIN_ID")),
        verifyingContract: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS")
      },
      primaryType: "SplitPlan",
      types: {
        SplitPlan: [
          { name: "owner", type: "address" },
          { name: "wallets", type: "address[]" },
          { name: "amounts", type: "uint256[]" },
          { name: "totalCollateral", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      message: {
        owner: dto.owner as `0x${string}`,
        wallets: dto.wallets as `0x${string}`[],
        amounts: normalizedAmounts,
        totalCollateral: normalizedTotalCollateral,
        expiresAt: BigInt(dto.expiresAt),
        nonce: dto.nonce as `0x${string}`
      },
      signature: dto.signature as `0x${string}`
    });

    if (!verified) {
      throw new BadRequestException("Invalid split plan signature");
    }

    const ownerHash = keccak256(
      stringToHex(`${dto.owner}:${this.configService.getOrThrow<string>("SESSION_SALT")}`)
    );
    const allocationTxHash = await this.walletClient.writeContract({
      account: this.backendAccount,
      address: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS"),
      abi: lendingAbi,
      functionName: "allocateCollateralToBorrowers",
      args: [
        dto.wallets as `0x${string}`[],
        normalizedAmounts,
        dto.nonce as `0x${string}`
      ],
      chain: undefined
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: allocationTxHash });
    if (receipt.status !== "success") {
      throw new BadRequestException("Split plan allocation transaction reverted");
    }

    await this.splitPlanRepository.update(
      {
        owner: dto.owner,
        isActive: true
      },
      {
        isActive: false
      }
    );

    const record = this.splitPlanRepository.create({
      owner: dto.owner,
      ownerHash,
      wallets: dto.wallets,
      amounts: dto.amounts,
      totalCollateral: dto.totalCollateral,
      nonce: dto.nonce,
      signature: dto.signature,
      status: "success",
      txHash: allocationTxHash,
      blockNumber: receipt.blockNumber.toString(),
      expiresAt: new Date(),
      isActive: true
    });

    const saved = await this.splitPlanRepository.save(record);
    const liquidationLtvBps = await this.publicClient.readContract({
      address: this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS"),
      abi: lendingAbi,
      functionName: "liquidationLtvBps"
    });

    for (const borrowerWallet of dto.wallets) {
      const existingState = await this.positionStateRepository.findOne({
        where: {
          borrowerWallet
        }
      });

      if (!existingState) {
        const bootstrapState = this.positionStateRepository.create({
          owner: dto.owner,
          borrowerWallet,
          collateral: "0",
          debt: "0",
          currentLtvBps: "0",
          liquidationLtvBps: liquidationLtvBps.toString(),
          lastSyncedBlockNumber: null
        });

        await this.positionStateRepository.save(bootstrapState);
      }
    }

    await this.positionIndexerService.syncThroughBlock(receipt.blockNumber);

    return {
      splitPlanId: saved.id,
      expiresAt: saved.expiresAt.toISOString(),
      walletCount: saved.wallets.length,
      allocationTxHash
    };
  }

  async getLatestSplitPlanForDisplay(owner: string) {
    const positionStates = await this.positionStateRepository.find({
      where: {
        owner
      },
      order: {
        updatedAt: "DESC"
      }
    });

    if (positionStates.length === 0) {
      throw new NotFoundException("No position state found for the owner");
    }

    const wallets = positionStates.map((record) => record.borrowerWallet as `0x${string}`);
    const amounts = positionStates.map((record) => record.collateral);
    const createdAts = positionStates.map((record) => record.createdAt.toISOString());
    const updatedAts = positionStates.map((record) => record.updatedAt.toISOString());
    const totalCollateral = positionStates.reduce(
      (sum, record) => sum + BigInt(record.collateral),
      0n
    );

    return {
      splitPlanId: "position-state-view",
      owner,
      wallets,
      amounts,
      createdAts,
      updatedAts,
      totalCollateral: totalCollateral.toString(),
      expiresAt: new Date(0).toISOString(),
      walletCount: wallets.length
    };
  }

  async getExecutableSplitPlanForBorrowerOrThrow(owner: string, borrowerWallet: string) {
    const records = await this.splitPlanRepository.find({
      where: {
        owner,
        isActive: true
      },
      order: {
        createdAt: "DESC"
      }
    });

    const activeRecord = records.find((record) => {
      if (record.expiresAt.getTime() <= Date.now()) {
        return false;
      }

      return record.wallets.some((wallet) => wallet.toLowerCase() === borrowerWallet.toLowerCase());
    });

    if (!activeRecord) {
      throw new NotFoundException("No active split plan links this owner to the borrower wallet");
    }

    const walletIndex = activeRecord.wallets.findIndex(
      (wallet) => wallet.toLowerCase() === borrowerWallet.toLowerCase()
    );

    if (walletIndex < 0) {
      throw new NotFoundException("Borrower wallet allocation not found");
    }

    return {
      splitPlan: activeRecord,
      borrowerAllocation: activeRecord.amounts[walletIndex]
    };
  }

  async getLatestSplitPlanLinkForBorrowerOrThrow(owner: string, borrowerWallet: string) {
    const records = await this.splitPlanRepository.find({
      where: {
        owner
      },
      order: {
        createdAt: "DESC"
      }
    });

    const latestRecord = records.find((record) =>
      record.wallets.some((wallet) => wallet.toLowerCase() === borrowerWallet.toLowerCase())
    );

    if (!latestRecord) {
      throw new NotFoundException("No split plan links this owner to the borrower wallet");
    }

    const walletIndex = latestRecord.wallets.findIndex(
      (wallet) => wallet.toLowerCase() === borrowerWallet.toLowerCase()
    );

    if (walletIndex < 0) {
      throw new NotFoundException("Borrower wallet allocation not found");
    }

    return {
      splitPlan: latestRecord,
      borrowerAllocation: latestRecord.amounts[walletIndex]
    };
  }

  async getLatestOwnerForBorrowerOrThrow(borrowerWallet: string) {
    const latestRecord = await this.positionStateRepository.findOne({
      where: {
        borrowerWallet
      }
    });

    if (!latestRecord) {
      throw new NotFoundException("No position state contains the borrower wallet");
    }

    return latestRecord.owner;
  }

  async getAllPositionsForDisplay(owner?: string) {
    const records = await this.positionStateRepository.find({
      where: owner ? { owner } : undefined,
      order: {
        updatedAt: "DESC"
      }
    });

    return records.map((record) => ({
      owner: record.owner as `0x${string}`,
      borrowerWallet: record.borrowerWallet as `0x${string}`,
      collateral: record.collateral,
      debt: record.debt,
      currentLtvBps: record.currentLtvBps,
      liquidationLtvBps: record.liquidationLtvBps,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    }));
  }

}
