import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Entity({ name: "position_state_records" })
export class PositionStateRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 42 })
  owner!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 42 })
  borrowerWallet!: string;

  @Column({ type: "numeric", precision: 78, scale: 0 })
  collateral!: string;

  @Column({ type: "numeric", precision: 78, scale: 0 })
  debt!: string;

  @Column({ type: "varchar", length: 32 })
  currentLtvBps!: string;

  @Column({ type: "varchar", length: 32 })
  liquidationLtvBps!: string;

  @Column({ type: "varchar", length: 32, nullable: true })
  lastSyncedBlockNumber!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
