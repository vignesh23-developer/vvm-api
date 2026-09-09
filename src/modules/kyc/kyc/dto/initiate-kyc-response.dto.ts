import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateKycResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  verificationId: string;

  @ApiProperty()
  verificationUrl: string;

  @ApiProperty()
  expiresInSeconds: number;

  @ApiPropertyOptional()
  message?: string;
}