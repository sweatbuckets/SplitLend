import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Entity({ name: "split_plan_records" })
export class SplitPlanRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Split plan records keep the owner's signed authorization history.
  // They are not the source of truth for live collateral/debt state.
  @Index()
  @Column({ type: "varchar", length: 42 })
  owner!: string;

  @Index()
  @Column({ type: "varchar", length: 128 })
  ownerHash!: string;

  @Column({ type: "simple-json" })
  wallets!: string[];

  @Column({ type: "simple-json" })
  amounts!: string[];

  @Column({ type: "varchar", length: 78 })
  totalCollateral!: string;

  @Column({ type: "varchar", length: 66, unique: true })
  nonce!: string;

  @Column({ type: "varchar", length: 255 })
  signature!: string;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 66, nullable: true })
  txHash!: string | null;

  @Column({ type: "varchar", length: 78, nullable: true })
  blockNumber!: string | null;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
