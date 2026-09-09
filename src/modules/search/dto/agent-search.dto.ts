import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Agent Sort Options
 */
export enum AgentSortBy {
  RELEVANCE = 'relevance',
  NEWEST = 'newest',
  OLDEST = 'oldest',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
}

/**
 * Agent Search DTO
 */
export class AgentSearchDto {
  // ==================== TEXT SEARCH ====================
  @ApiPropertyOptional({ description: 'Search text (name, company, city)', example: 'Real Estate Chennai' })
  @IsOptional()
  @IsString()
  q?: string;

  // ==================== PAGINATION ====================
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
  @Max(100)
  limit?: number = 10;

  // ==================== SORTING ====================
  @ApiPropertyOptional({ enum: AgentSortBy, default: AgentSortBy.NEWEST })
  @IsOptional()
  @IsEnum(AgentSortBy)
  sort?: AgentSortBy;

  // ==================== LOCATION FILTERS ====================
  @ApiPropertyOptional({ description: 'City name' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'District name' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'State name' })
  @IsOptional()
  @IsString()
  state?: string;

  // ==================== GEO FILTERS ====================
  @ApiPropertyOptional({ description: 'Latitude for radius search' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for radius search' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lon?: number;

  @ApiPropertyOptional({ description: 'Search radius', default: '10km' })
  @IsOptional()
  @IsString()
  radius?: string = '10km';

  // ==================== BOOLEAN FLAGS ====================
  @ApiPropertyOptional({ description: 'Only verified agents' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_verified?: boolean;

  // ==================== USER FILTER ====================
  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsUUID()
  user_id?: string;

  // ==================== RESPONSE OPTIONS ====================
  @ApiPropertyOptional({ description: 'Include filter aggregations', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_filters?: boolean = false;
}

/**
 * Agent Autocomplete DTO
 */
export class AgentAutocompleteDto {
  @ApiPropertyOptional({ description: 'Search prefix', example: 'Che' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'City filter' })
  @IsOptional()
  @IsString()
  city?: string;
}