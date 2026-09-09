import {
  IsEnum,
  IsUUID,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Entity Type Enum (matching your existing pattern)
 */
export enum ViewEntityType {
  PROPERTY = 'PROPERTY',
  AD = 'AD',
}

/**
 * Record View DTO
 */
export class RecordViewDto {
  @ApiProperty({ enum: ViewEntityType, example: ViewEntityType.PROPERTY })
  @IsEnum(ViewEntityType)
  entity_type: ViewEntityType;

  @ApiProperty({ description: 'Property or Ad ID' })
  @IsUUID()
  entity_id: string;
}

/**
 * Get Recently Viewed Query DTO
 */
export class GetRecentlyViewedDto {
  @ApiPropertyOptional({ enum: ViewEntityType })
  @IsOptional()
  @IsEnum(ViewEntityType)
  entity_type?: ViewEntityType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}