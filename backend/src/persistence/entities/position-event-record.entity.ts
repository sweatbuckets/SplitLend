import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Entity({ name: "position_event_records" })
@Index(["txHash", "logIndex"], { unique: true })
export class PositionEventRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 66 })
  txHash!: string;

  @Column({ type: "integer" })
  logIndex!: number;

  @Index()
  @Column({ type: "varchar", length: 42, nullable: true })
  borrowerWallet!: string | null;

  @Column({ type: "varchar", length: 64 })
  blockNumber!: string;

  @Column({ type: "varchar", length: 64 })
  eventName!: string;

  @Column({ type: "simple-json" })
  payload!: Record<string, string | boolean | null>;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
