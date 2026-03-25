import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DelegationController } from "./delegation.controller";
import { DelegationService } from "./delegation.service";
import { IndexerModule } from "../indexer/indexer.module";
import { PositionStateRecord } from "../persistence/entities/position-state-record.entity";
import { SplitPlanRecord } from "../persistence/entities/split-plan-record.entity";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => IndexerModule),
    TypeOrmModule.forFeature([SplitPlanRecord, PositionStateRecord])
  ],
  controllers: [DelegationController],
  providers: [DelegationService],
  exports: [DelegationService]
})
export class DelegationModule {}
