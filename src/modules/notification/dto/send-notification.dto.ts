import {
  NotificationChannel,
  NotificationPriority
} from '../enums/notification.enum';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendNotificationDto {
  @ApiProperty({ description: 'User ID to send notification to' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'PROPERTY_APPROVED', description: 'Template code' })
  @IsString()
  templateCode: string;

  @ApiProperty({ description: 'Variables to substitute in template' })
  @IsObject()
  variables: Record<string, any>;

  @ApiPropertyOptional({ description: 'Entity type (PROPERTY, AD, etc.)' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Entity ID' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ enum: NotificationPriority })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({ description: 'Schedule for later' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: NotificationChannel,
    isArray: true
  })
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  overrideChannels?: NotificationChannel[];
}
