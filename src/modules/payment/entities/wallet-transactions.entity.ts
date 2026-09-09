import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserWallet } from './user-wallets.entity';

@Entity('wallet_transactions')
@Index(['user_wallet_id', 'type'])
@Index(['user_wallet_id', 'status'])
@Index(['status', 'expires_at']) // For expiry cron job
@Index(['reference_type', 'reference_id'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserWallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'user_wallet_id' })
  user_wallet: UserWallet;

  @Column({ type: 'uuid' })
  user_wallet_id: string;

  @Column({ type: 'varchar', length: 10 })
  type: string; // CREDIT, DEBIT

  @Column({ type: 'varchar', length: 30 })
  source: string; // REFERRAL_BONUS, AADHAAR_VERIFICATION, PROMOTIONAL, CASHBACK, PAYMENT_USAGE, REFUND, EXPIRED, ADMIN_CREDIT, ADMIN_DEBIT

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // Transaction amount

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance_after: number; // Wallet balance after this txn

  @Column({ type: 'varchar', length: 50, nullable: true })
  reference_type: string | null; // Related entity type

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference_id: string | null; // Related entity ID

  @Column({ type: 'text', nullable: true })
  description: string | null; // Human readable description

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string; // PENDING, HOLD, COMPLETED, REVERSED, EXPIRED

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null; // When this credit expires

  @Column({ type: 'timestamp', nullable: true })
  expired_at: Date | null; // When actually expired

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

