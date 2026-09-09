import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  WhatsAppButtonType,
  WhatsAppHeaderType
} from '../enums/notification.enum';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString
} from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ example: 'PROPERTY_APPROVED' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Property Approved' })
  @IsString()
  name: string;

  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['property_title', 'property_id'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({ type: [String], enum: NotificationChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  consumes_quota?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_paid_subscription?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  target_roles?: string[];

  // SMS Configuration
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sms_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sms_template_id?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sms_variables?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sms_preview?: string;

  // WhatsApp Configuration
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  whatsapp_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp_template_name?: string;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  whatsapp_language_code?: string;

  @ApiPropertyOptional({ enum: WhatsAppHeaderType  })
  @IsOptional()
  @IsEnum(WhatsAppHeaderType)
  whatsapp_header_type?: WhatsAppHeaderType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whatsapp_header_variables?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whatsapp_body_variables?: string[];

  @ApiPropertyOptional({ enum: WhatsAppButtonType  })
  @IsOptional()
  @IsEnum(WhatsAppButtonType)
  whatsapp_button_type?: WhatsAppButtonType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp_button_url_variable?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp_preview?: string;

  // Email Configuration
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email_subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email_html_template?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email_text_template?: string;

  // Push Configuration
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  push_title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  push_body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  push_icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  push_image_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  push_click_action?: string;

  @ApiPropertyOptional({ default: 'default' })
  @IsOptional()
  @IsString()
  push_sound?: string;

  // In-App Configuration
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  in_app_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  in_app_title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  in_app_body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  in_app_icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  in_app_action_url?: string;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  in_app_priority?: NotificationPriority;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  admin_notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}