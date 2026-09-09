import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Notification } from './notification.entity';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationProvider,
} from '../enums/notification.enum';

@Entity('notification_logs')
@Index('IDX_notification_logs_notification_id', ['notification_id'])
@Index('IDX_notification_logs_status', ['channel', 'status'])
@Index('IDX_notification_logs_retry', ['status', 'next_retry_at'])
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  notification_id: string;

  @ManyToOne(() => Notification, (notification) => notification.logs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notification_id' })
  notification: Notification;

  @Column({ type: 'varchar', length: 20 })
  channel: NotificationChannel;

  @Column({ type: 'varchar', length: 20, default: NotificationDeliveryStatus.PENDING })
  status: NotificationDeliveryStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: NotificationProvider;

  @Column({ type: 'varchar', length: 200, nullable: true })
  provider_message_id: string;

  @Column({ type: 'jsonb', nullable: true })
  provider_response: Record<string, any>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  recipient: string;

  @Column({ type: 'uuid', nullable: true })
  device_session_id: string;

  @Column({ type: 'timestamp', nullable: true })
  queued_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  delivered_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  clicked_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  failed_at: Date;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  error_code: string;

  @Column({ type: 'int', default: 0 })
  retry_count: number;

  @Column({ type: 'timestamp', nullable: true })
  next_retry_at: Date;

  @Column({ type: 'int', nullable: true })
  cost_paisa: number;

  @Column({ type: 'boolean', default: false })
  quota_consumed: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}