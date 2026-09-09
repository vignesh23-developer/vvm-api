import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class SignOutDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({
    description: 'Device ID to sign out from specific device'
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
