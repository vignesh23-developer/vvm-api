import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WalletTransaction } from './wallet-transactions.entity';

@Entity('user_wallets')
@Index(['user_id'], { unique: true })
export class UserWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', unique: true })
  user_id: string; // FK to users (unique)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  balance: number; // Current available balance

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lifetime_credited: number; // Total ever credited

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lifetime_debited: number; // Total ever debited

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lifetime_expired: number; // Total expired unused

  @Column({ type: 'boolean', default: true })
  is_active: boolean; // Wallet active status

  @OneToMany(() => WalletTransaction, (transaction) => transaction.user_wallet)
  transactions: WalletTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

