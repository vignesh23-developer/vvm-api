import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycEntityType, KycStatus, VerificationType } from '../../enums';

export class KycStatusResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: KycEntityType })
  entityType: KycEntityType;

  @ApiProperty({ enum: VerificationType })
  verificationType: VerificationType;

  @ApiProperty({ enum: KycStatus })
  status: KycStatus;

  @ApiPropertyOptional()
  documentNumberMasked?: string;

  @ApiPropertyOptional()
  verifiedName?: string;

  @ApiPropertyOptional()
  verifiedData?: Record<string, any>;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  completedAt?: Date;
}