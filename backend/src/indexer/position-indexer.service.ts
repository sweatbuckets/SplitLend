import { forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createPublicClient, getAddress, http } from "viem";

import { DelegationService } from "../delegation/delegation.service";
import { IndexerCursorRecord } from "../persistence/entities/indexer-cursor-record.entity";
import { PositionEventRecord } from "../persistence/entities/position-event-record.entity";
import { PositionStateRecord } from "../persistence/entities/position-state-record.entity";
import { lendingAbi } from "../viem/contracts";

@Injectable()
export class PositionIndexerService {
  private readonly publicClient: ReturnType<typeof createPublicClient>;
  private readonly lendingAddress: `0x${string}`;
  private readonly cursorKey = "karma-session-lending";

  constructor(
    @InjectRepository(PositionEventRecord)
    private readonly positionEventRepository: Repository<PositionEventRecord>,
    @InjectRepository(PositionStateRecord)
    private readonly positionStateRepository: Repository<PositionStateRecord>,
    @InjectRepository(IndexerCursorRecord)
    private readonly indexerCursorRepository: Repository<IndexerCursorRecord>,
    @Inject(forwardRef(() => DelegationService))
    private readonly delegationService: DelegationService,
    private readonly configService: ConfigService
  ) {
    this.publicClient = createPublicClient({
      transport: http(this.configService.getOrThrow<string>("RPC_URL"))
    });
    this.lendingAddress = this.configService.getOrThrow<`0x${string}`>("LENDING_ADDRESS");
  }

  async syncToLatest() {
    const latestBlock = await this.publicClient.getBlockNumber();
    return this.syncThroughBlock(latestBlock);
  }

  async syncThroughBlock(toBlock: bigint) {
    const cursor = await this.indexerCursorRepository.findOne({
      where: {
        cursorKey: this.cursorKey
      }
    });

    const fromBlock = cursor ? BigInt(cursor.lastSyncedBlockNumber) + 1n : 0n;
    if (fromBlock > toBlock) {
      return {
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        syncedEvents: 0
      };
    }

    const logs = await this.publicClient.getLogs({
      address: this.lendingAddress,
      fromBlock,
      toBlock,
      events: lendingAbi.filter((entry) => entry.type === "event")
    });

    let syncedEvents = 0;

    for (const log of logs) {
      const txHash = log.transactionHash;
      const logIndex = Number(log.logIndex);
      if (!txHash) continue;

      const existing = await this.positionEventRepository.findOne({
        where: {
          txHash,
          logIndex
        }
      });

      if (existing) {
        continue;
      }

      const borrowerWallet = "borrowerWallet" in log.args && log.args.borrowerWallet
        ? getAddress(log.args.borrowerWallet)
        : null;

      const payload = Object.fromEntries(
        Object.entries(log.args).map(([key, value]) => [
          key,
          typeof value === "bigint" ? value.toString() : typeof value === "boolean" ? value : value ? String(value) : null
        ])
      );

      const eventRecord = this.positionEventRepository.create({
        txHash,
        logIndex,
        borrowerWallet,
        blockNumber: log.blockNumber.toString(),
        eventName: log.eventName,
        payload
      });

      await this.positionEventRepository.save(eventRecord);
      if (borrowerWallet) {
        await this.applyEventToPositionState(eventRecord);
      }
      syncedEvents += 1;
    }

    const nextCursor = this.indexerCursorRepository.create({
      id: cursor?.id,
      cursorKey: this.cursorKey,
      lastSyncedBlockNumber: toBlock.toString()
    });
    await this.indexerCursorRepository.save(nextCursor);

    return {
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      syncedEvents
    };
  }

  private async applyEventToPositionState(eventRecord: PositionEventRecord) {
    if (!eventRecord.borrowerWallet) return;

    const borrowerWallet = eventRecord.borrowerWallet;
    const existing = await this.positionStateRepository.findOne({
      where: {
        borrowerWallet
      }
    });
    let owner = existing?.owner ?? null;
    if (!owner) {
      try {
        owner = await this.delegationService.getLatestOwnerForBorrowerOrThrow(borrowerWallet);
      } catch (error) {
        if (error instanceof NotFoundException) {
          return;
        }
        throw error;
      }
    }

    let collateral = BigInt(existing?.collateral ?? "0");
    let debt = BigInt(existing?.debt ?? "0");

    switch (eventRecord.eventName) {
      case "CollateralAllocated":
        collateral += BigInt(eventRecord.payload.amount as string);
        break;
      case "Borrowed":
        debt += BigInt(eventRecord.payload.amount as string);
        break;
      case "Repaid":
        debt -= BigInt(eventRecord.payload.amount as string);
        break;
      case "Withdrawn":
        collateral -= BigInt(eventRecord.payload.amount as string);
        break;
      case "Liquidated":
        debt -= BigInt(eventRecord.payload.debtRepaid as string);
        collateral -= BigInt(eventRecord.payload.collateralSeized as string);
        break;
      default:
        return;
    }

    if (collateral < 0n) collateral = 0n;
    if (debt < 0n) debt = 0n;

    const liquidationLtvBps = await this.publicClient.readContract({
      address: this.lendingAddress,
      abi: lendingAbi,
      functionName: "liquidationLtvBps",
      args: []
    });
    const currentLtvBps =
      collateral === 0n || debt === 0n ? 0n : (debt * 10000n) / collateral;

    const record = this.positionStateRepository.create({
      id: existing?.id,
      owner,
      borrowerWallet,
      collateral: collateral.toString(),
      debt: debt.toString(),
      currentLtvBps: currentLtvBps.toString(),
      liquidationLtvBps: liquidationLtvBps.toString(),
      lastSyncedBlockNumber: eventRecord.blockNumber
    });

    await this.positionStateRepository.save(record);
  }
}
