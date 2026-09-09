import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { NotificationChannel } from '../enums/notification.enum';

export class BulkChannelPreferenceDto {
  @ApiProperty({ enum: NotificationChannel   })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}