import { IsBoolean, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QuietHoursDto {
  @ApiProperty({ default: false })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: '22:00' })
  @IsString()
  start: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  end: string;

  @ApiProperty({ example: 'Asia/Kolkata' })
  @IsString()
  timezone: string;
}