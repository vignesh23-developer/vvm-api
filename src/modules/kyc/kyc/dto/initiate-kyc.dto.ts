import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { VerificationType, KycEntityType } from '../../enums';

export class InitiateKycDto {
  @ApiProperty({
    description: 'Redirect URL after verification completion',
    example: 'https://myapp.com/kyc/callback'
  })
  @IsString()
  redirectUrl: string;

  @ApiPropertyOptional({
    enum: VerificationType,
    default: VerificationType.AADHAAR
  })
  @IsOptional()
  @IsEnum(VerificationType)
  verificationType?: VerificationType;

  @ApiPropertyOptional({
    enum: KycEntityType,
    default: KycEntityType.USER
  })
  @IsOptional()
  @IsEnum(KycEntityType)
  entityType?: KycEntityType;

  @ApiPropertyOptional({
    description: 'Company ID if entityType is COMPANY'
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Direct call to initiate KYC',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  directCall?: boolean;
}