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
import { PaymentTransaction } from './payment-transactions.entity';

@Entity('payment_orders')
@Index(['order_number'], { unique: true })
@Index(['gateway_order_id'])
@Index(['user_id', 'status'])
@Index(['user_id', 'created_at'])
@Index(['status', 'created_at'])
export class PaymentOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  order_number: string; // VVM-PAY-20250129-00001

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 20 })
  gateway: string; // RAZORPAY, PHONEPE, PAYTM

  @Column({ type: 'varchar', length: 100, nullable: true })
  gateway_order_id: string | null;

  @Column({ type: 'varchar', length: 20 })
  channel: string; // WEB, ANDROID, IOS

  @Column({ type: 'varchar', length: 30 })
  purpose: string; // SUBSCRIPTION, ADDON, PROPERTY_BOOST, FEATURED_LISTING

  @Column({ type: 'varchar', length: 50, nullable: true })
  related_entity_type: string | null; // subscription_plan, subscription_item, property

  @Column({ type: 'varchar', length: 100, nullable: true })
  related_entity_id: string | null; // Can be numeric ID or UUID depending on entity type

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  base_amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  tax_percent: number; // 18.00 for GST

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tax_amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number; // base_amount + tax_amount

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount_amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  wallet_amount_used: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  payable_amount: number; // subtotal - discount - wallet

  @Column({ type: 'varchar', length: 50, nullable: true })
  promo_code: string | null;

  @Column({ type: 'varchar', length: 20, default: 'CREATED' })
  status: string; // CREATED, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED

  @Column({ type: 'jsonb', nullable: true })
  notes: Record<string, any> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null; // Order expiry (15-30 mins)

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @OneToMany(() => PaymentTransaction, (transaction) => transaction.payment_order)
  transactions: PaymentTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

