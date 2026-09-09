import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NotificationCategory } from '../enums/notification.enum';

@Entity('notification_preferences')
@Unique('UQ_notification_preferences_user_category', ['user_id', 'category'])
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('IDX_notification_preferences_user_id')
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  category: NotificationCategory;

  @Column({ type: 'boolean', default: true })
  in_app_enabled: boolean;

  @Column({ type: 'boolean', default: true })
  push_enabled: boolean;

  @Column({ type: 'boolean', default: true })
  email_enabled: boolean;

  @Column({ type: 'boolean', default: true })
  sms_enabled: boolean;

  @Column({ type: 'boolean', default: true })
  whatsapp_enabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  quiet_hours: {
    enabled: boolean;
    start: string;  // "22:00"
    end: string;    // "08:00"
    timezone: string;  // "Asia/Kolkata"
  };

  @Column({ type: 'varchar', length: 20, default: 'instant' })
  email_frequency: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}