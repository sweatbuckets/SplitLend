import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Entity({ name: "borrow_intent_records" })
export class BorrowIntentRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", length: 42 })
  owner!: string;

  @Index()
  @Column({ type: "varchar", length: 42 })
  borrowerWallet!: string;

  @Column({ type: "varchar", length: 42 })
  receiver!: string;

  @Column({ type: "numeric", precision: 78, scale: 0 })
  borrowAmount!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 66 })
  txHash!: string;

  @Column({ type: "varchar", length: 32 })
  status!: string;

  @Column({ type: "varchar", length: 78 })
  blockNumber!: string;

  @Column({ type: "varchar", length: 66, unique: true })
  nonce!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
