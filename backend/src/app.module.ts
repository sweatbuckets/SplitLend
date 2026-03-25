import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { IndexerModule } from "./indexer/indexer.module";
import { DelegationModule } from "./delegation/delegation.module";
import { LoanModule } from "./loan/loan.module";
import { BorrowIntentRecord } from "./persistence/entities/borrow-intent-record.entity";
import { IndexerCursorRecord } from "./persistence/entities/indexer-cursor-record.entity";
import { PositionStateRecord } from "./persistence/entities/position-state-record.entity";
import { PositionEventRecord } from "./persistence/entities/position-event-record.entity";
import { SplitPlanRecord } from "./persistence/entities/split-plan-record.entity";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres" as const,
        url: configService.getOrThrow<string>("DATABASE_URL"),
        autoLoadEntities: true,
        synchronize: true,
        entities: [BorrowIntentRecord, SplitPlanRecord, PositionStateRecord, PositionEventRecord, IndexerCursorRecord]
      })
    }),
    IndexerModule,
    DelegationModule,
    LoanModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
