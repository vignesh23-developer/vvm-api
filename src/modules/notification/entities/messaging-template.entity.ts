import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  WhatsAppHeaderType,
  WhatsAppButtonType,
} from '../enums/notification.enum';

@Entity('messaging_templates')
export class MessagingTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  @Index('IDX_messaging_templates_code')
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  @Index('IDX_messaging_templates_category')
  category: NotificationCategory;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', default: [] })
  variables: string[];

  @Column({ type: 'jsonb', default: ['in_app'] })
  channels: NotificationChannel[];

  @Column({ type: 'boolean', default: true })
  consumes_quota: boolean;

  @Column({ type: 'boolean', default: false })
  requires_paid_subscription: boolean;

  @Column({ type: 'jsonb', nullable: true })
  target_roles: string[];

  @Column({ type: 'boolean', default: false })
  sms_enabled: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sms_template_id: string;

  @Column({ type: 'jsonb', nullable: true })
  sms_variables: string[];

  @Column({ type: 'text', nullable: true })
  sms_preview: string;

  @Column({ type: 'boolean', default: false })
  whatsapp_enabled: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  whatsapp_template_name: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  whatsapp_language_code: string;

  @Column({ type: 'varchar', length: 20, default: WhatsAppHeaderType.NONE })
  whatsapp_header_type: WhatsAppHeaderType;

  @Column({ type: 'jsonb', nullable: true })
  whatsapp_header_variables: string[];

  @Column({ type: 'jsonb', nullable: true })
  whatsapp_body_variables: string[];

  @Column({ type: 'varchar', length: 20, default: WhatsAppButtonType.NONE })
  whatsapp_button_type: WhatsAppButtonType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  whatsapp_button_url_variable: string;

  @Column({ type: 'text', nullable: true })
  whatsapp_preview: string;

  @Column({ type: 'boolean', default: false })
  email_enabled: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  email_subject: string;

  @Column({ type: 'text', nullable: true })
  email_html_template: string;

  @Column({ type: 'text', nullable: true })
  email_text_template: string;

  @Column({ type: 'boolean', default: false })
  push_enabled: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  push_title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  push_body: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  push_icon: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  push_image_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  push_click_action: string;

  @Column({ type: 'varchar', length: 50, default: 'default' })
  push_sound: string;

  @Column({ type: 'boolean', default: true })
  in_app_enabled: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  in_app_title: string;

  @Column({ type: 'text', nullable: true })
  in_app_body: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  in_app_icon: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  in_app_action_url: string;

  @Column({ type: 'varchar', length: 20, default: NotificationPriority.NORMAL })
  in_app_priority: NotificationPriority;


  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  admin_notes: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}