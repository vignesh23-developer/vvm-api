import { KycStatusResponseDto } from './kyc-status-response.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MyKycStatusResponseDto {
  @ApiProperty()
  isVerified: boolean;

  @ApiPropertyOptional()
  verifiedAt?: Date;

  @ApiPropertyOptional()
  aadhaarMasked?: string;

  @ApiPropertyOptional()
  latestAttempt?: KycStatusResponseDto;
}
