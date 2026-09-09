import { ApiPropertyOptional } from '@nestjs/swagger';
import { KycEntityType, KycStatus, VerificationType } from '../../enums';
import { IsEnum, IsOptional } from 'class-validator';

export class GetVerificationsQueryDto {
  @ApiPropertyOptional({ enum: KycStatus })
  @IsOptional()
  @IsEnum(KycStatus)
  status?: KycStatus;

  @ApiPropertyOptional({ enum: VerificationType })
  @IsOptional()
  @IsEnum(VerificationType)
  verificationType?: VerificationType;

  @ApiPropertyOptional({ enum: KycEntityType })
  @IsOptional()
  @IsEnum(KycEntityType)
  entityType?: KycEntityType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}