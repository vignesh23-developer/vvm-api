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
import { PaymentTransaction } from './payment-transactions.entity';

@Entity('payment_reconciliations')
@Index(['payment_transaction_id'])
@Index(['type', 'status'])
@Index(['gateway_event_id'])
export class PaymentReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PaymentTransaction, (transaction) => transaction.reconciliations)
  @JoinColumn({ name: 'payment_transaction_id' })
  payment_transaction: PaymentTransaction;

  @Column({ type: 'uuid' })
  payment_transaction_id: string;

  @Column({ type: 'varchar', length: 30 })
  type: string; // LATE_AUTHORIZATION, REFUND, PARTIAL_REFUND, CHARGEBACK, SETTLEMENT

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // Amount involved

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string; // PENDING, PROCESSED, FAILED, REQUIRES_ACTION

  @Column({ type: 'varchar', length: 100, nullable: true })
  gateway_event_id: string | null; // Webhook event ID

  @Column({ type: 'varchar', length: 100, nullable: true })
  gateway_refund_id: string | null; // Refund ID if applicable

  @Column({ type: 'text', nullable: true })
  reason: string | null; // Reason for this event

  @Column({ type: 'jsonb', nullable: true })
  webhook_payload: Record<string, any> | null; // Full webhook data

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date | null; // When processed

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

