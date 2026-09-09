import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsUUID,
  Min,
  Max,
  MinLength
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


export enum AdStatus {
  AVAILABLE = 'AVAILABLE',
  SOLD = 'SOLD',
  RESERVED = 'RESERVED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum AdSortBy {
  RELEVANCE = 'relevance',
  PRICE_LOW = 'price_asc',
  PRICE_HIGH = 'price_desc',
  NEWEST = 'newest',
  OLDEST = 'oldest',
  POPULAR = 'popular',
}

export class AdSearchDto {
  // ==================== TEXT SEARCH ====================
  @ApiPropertyOptional({ description: 'Search text', example: 'iPhone 15' })
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
  @ApiPropertyOptional({ enum: AdSortBy, default: AdSortBy.NEWEST })
  @IsOptional()
  @IsEnum(AdSortBy)
  sort?: AdSortBy;

  // ==================== BASIC FILTERS ====================
  @ApiPropertyOptional({ enum: AdStatus })
  @IsOptional()
  @IsEnum(AdStatus)
  status?: AdStatus;

  // ==================== CATEGORY FILTERS ====================
  @ApiPropertyOptional({ description: 'Category ID (UUID)' })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  // NEW: Filter by category name
  @ApiPropertyOptional({
    description: 'Category name (e.g., "Electronics", "Vehicles")',
    example: 'Electronics'
  })
  @IsOptional()
  @IsString()
  category_name?: string;

  // ==================== LOCATION FILTERS ====================
  @ApiPropertyOptional({ description: 'District name (PRIORITY)', example: 'Anna Nagar' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'City name' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State name' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Postal code' })
  @IsOptional()
  @IsString()
  postal_code?: string;

  // ==================== PRICE FILTERS ====================
  @ApiPropertyOptional({ description: 'Minimum price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price_min?: number;

  @ApiPropertyOptional({ description: 'Maximum price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price_max?: number;

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
  @ApiPropertyOptional({ description: 'Only verified ads' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_verified?: boolean;

  @ApiPropertyOptional({ description: 'Only premium ads' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_premium?: boolean;

  @ApiPropertyOptional({ description: 'Only featured ads' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_featured?: boolean;

  @ApiPropertyOptional({ description: 'Only negotiable ads' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_negotiable?: boolean;

  // ==================== OWNER FILTER ====================
  @ApiPropertyOptional({ description: 'Filter by owner ID' })
  @IsOptional()
  @IsUUID()
  owner_id?: string;

  // ==================== RESPONSE OPTIONS ====================
  @ApiPropertyOptional({ description: 'Include filter aggregations', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_filters?: boolean = false;
}

export class AdAutocompleteDto {
  @ApiProperty({ description: 'Search prefix (min 2 characters)' })
  @IsString()
  @MinLength(2)
  q: string;

  @ApiPropertyOptional({ description: 'Max results', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @ApiPropertyOptional({ description: 'Filter by category name' })
  @IsOptional()
  @IsString()
  category_name?: string;

  @ApiPropertyOptional({ description: 'Filter by district' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;
}