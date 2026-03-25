import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DelegationModule } from "../delegation/delegation.module";
import { IndexerCursorRecord } from "../persistence/entities/indexer-cursor-record.entity";
import { PositionEventRecord } from "../persistence/entities/position-event-record.entity";
import { PositionStateRecord } from "../persistence/entities/position-state-record.entity";
import { PositionIndexerService } from "./position-indexer.service";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => DelegationModule),
    TypeOrmModule.forFeature([PositionEventRecord, PositionStateRecord, IndexerCursorRecord])
  ],
  providers: [PositionIndexerService],
  exports: [PositionIndexerService]
})
export class IndexerModule {}
