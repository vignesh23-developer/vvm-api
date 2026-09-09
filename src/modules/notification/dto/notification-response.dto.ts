import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority
} from '../enums/notification.enum';

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty()
  category: NotificationCategory;

  @ApiProperty()
  priority: NotificationPriority;

  @ApiPropertyOptional()
  entity_type?: string;

  @ApiPropertyOptional()
  entity_id?: string;

  @ApiPropertyOptional()
  action_url?: string;

  @ApiPropertyOptional()
  icon?: string;

  @ApiPropertyOptional()
  image_url?: string;

  @ApiProperty()
  is_read: boolean;

  @ApiPropertyOptional()
  read_at?: Date;

  @ApiProperty()
  created_at: Date;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  data: NotificationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  unreadCount: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class QuotaSummaryDto {
  @ApiProperty()
  channel: NotificationChannel;

  @ApiProperty()
  hasQuota: boolean;

  @ApiProperty()
  used: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  remaining: number;

  @ApiProperty()
  isUnlimited: boolean;

  @ApiProperty()
  percentUsed: number;

  @ApiProperty()
  resetDate: Date;
}

export class QuotaSummaryResponseDto {
  @ApiProperty({ type: QuotaSummaryDto })
  sms: QuotaSummaryDto;

  @ApiProperty({ type: QuotaSummaryDto })
  whatsapp: QuotaSummaryDto;
}
