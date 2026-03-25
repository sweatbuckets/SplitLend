import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DelegationModule } from "../delegation/delegation.module";
import { IndexerModule } from "../indexer/indexer.module";
import { BorrowIntentRecord } from "../persistence/entities/borrow-intent-record.entity";
import { PositionStateRecord } from "../persistence/entities/position-state-record.entity";
import { LoanController } from "./loan.controller";
import { LoanService } from "./loan.service";

@Module({
  imports: [
    ConfigModule,
    DelegationModule,
    IndexerModule,
    TypeOrmModule.forFeature([BorrowIntentRecord, PositionStateRecord])
  ],
  controllers: [LoanController],
  providers: [LoanService]
})
export class LoanModule {}
