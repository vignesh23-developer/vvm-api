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
import { PaymentOrder } from './payment-orders.entity';
import { PaymentReconciliation } from './payment-reconciliations.entity';

@Entity('payment_transactions')
@Index(['payment_order_id'])
@Index(['gateway_payment_id'])
@Index(['status'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PaymentOrder, (order) => order.transactions)
  @JoinColumn({ name: 'payment_order_id' })
  payment_order: PaymentOrder;

  @Column({ type: 'uuid' })
  payment_order_id: string;

  @Column({ type: 'int', default: 1 })
  attempt_number: number; // Which attempt (1, 2, 3...)

  @Column({ type: 'varchar', length: 100, nullable: true })
  gateway_payment_id: string | null; // Gateway's payment ID (pay_xxx)

  @Column({ type: 'varchar', length: 255, nullable: true })
  gateway_signature: string | null; // Signature for verification

  @Column({ type: 'varchar', length: 20, nullable: true })
  method: string | null; // UPI, CARD, NETBANKING, WALLET, EMI

  @Column({ type: 'jsonb', nullable: true })
  method_details: Record<string, any> | null; // VPA, card_last4, bank name, etc.

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // Amount for this transaction

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'INITIATED' })
  status: string; // INITIATED, PENDING, AUTHORIZED, CAPTURED, FAILED

  @Column({ type: 'varchar', length: 50, nullable: true })
  error_code: string | null; // Gateway error code

  @Column({ type: 'text', nullable: true })
  error_description: string | null; // Human readable error

  @Column({ type: 'jsonb', nullable: true })
  gateway_response: Record<string, any> | null; // Full gateway response

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gateway_fee: number | null; // Gateway charges (for reconciliation)

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gateway_tax: number | null; // Tax on gateway fee

  @Column({ type: 'timestamp', nullable: true })
  verified_at: Date | null; // When signature verified

  @OneToMany(() => PaymentReconciliation, (reconciliation) => reconciliation.payment_transaction)
  reconciliations: PaymentReconciliation[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

