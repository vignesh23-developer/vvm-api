import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteKycResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  verificationId?: string;

  @ApiPropertyOptional()
  maskedAadhaar?: string;

  @ApiPropertyOptional()
  verifiedName?: string;
}