import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { MessagingTemplate } from './messaging-template.entity';
import { NotificationLog } from './notification-log.entity';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationEntityType,
  NotificationChannel,
} from '../enums/notification.enum';

@Entity('notifications')
@Index('IDX_notifications_user_unread', ['user_id', 'is_read', 'created_at'])
@Index('IDX_notifications_user_category', ['user_id', 'category', 'created_at'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_notifications_user_id')
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  template_id: string;

  @ManyToOne(() => MessagingTemplate, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: MessagingTemplate;

  // Template code for quick reference
  @Column({ type: 'varchar', length: 100, nullable: true })
  template_code: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 50 })
  @Index('IDX_notifications_category')
  category: NotificationCategory;

  @Column({ type: 'varchar', length: 20, default: NotificationPriority.NORMAL })
  priority: NotificationPriority;

  @Column({ type: 'varchar', length: 50, nullable: true })
  entity_type: NotificationEntityType;

  @Column({ type: 'uuid', nullable: true })
  @Index('IDX_notifications_entity')
  entity_id: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  action_url: string;

  @Column({ type: 'jsonb', nullable: true })
  action_data: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon: string;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;

  @Column({ type: 'timestamp', nullable: true })
  read_at: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deleted_at: Date;

  @Column({ type: 'jsonb', default: [] })
  channels_sent: NotificationChannel[];

  @Column({ type: 'jsonb', default: [] })
  channels_skipped: NotificationChannel[];

  @Column({ type: 'boolean', default: false })
  is_sent: boolean;

  @OneToMany(() => NotificationLog, (log) => log.notification)
  logs: NotificationLog[];

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  scheduled_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date;

  // Expiry time (for auto-cleanup if needed)
  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;
}