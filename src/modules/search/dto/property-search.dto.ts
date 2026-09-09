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

/**
 * Listing Type Enum
 */
export enum ListingType {
  SALE = 'SALE',
  RENT = 'RENT',
  LEASE = 'LEASE',
  PG = 'PG'
}

/**
 * Property Status Enum
 */
export enum PropertyStatus {
  AVAILABLE = 'AVAILABLE',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
  UNDER_OFFER = 'UNDER_OFFER',
  WITHDRAWN = 'WITHDRAWN'
}

/**
 * Sort Options Enum
 */
export enum SortBy {
  RELEVANCE = 'relevance',
  PRICE_LOW = 'price_asc',
  PRICE_HIGH = 'price_desc',
  NEWEST = 'newest',
  OLDEST = 'oldest',
  POPULAR = 'popular',
  SIZE_LOW = 'size_asc',
  SIZE_HIGH = 'size_desc'
}

/**
 * Property Search DTO
 *
 * Frontend sends simple query params like:
 * GET /search/properties?q=3bhk+chennai&city=Chennai&price_min=5000000&bhk=2,3
 */
export class PropertySearchDto {
  // ==================== TEXT SEARCH ====================
  @ApiPropertyOptional({
    description:
      'Search text - searches in title, description, location, features',
    example: '3bhk apartment anna nagar'
  })
  @IsOptional()
  @IsString()
  q?: string;

  // ==================== PAGINATION ====================
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  // ==================== SORTING ====================
  @ApiPropertyOptional({ enum: SortBy, default: SortBy.RELEVANCE })
  @IsOptional()
  @IsEnum(SortBy)
  sort?: SortBy;

  // ==================== BASIC FILTERS ====================
  @ApiPropertyOptional({ enum: ListingType, example: 'SALE' })
  @IsOptional()
  @IsEnum(ListingType)
  listing_type?: ListingType;

  @ApiPropertyOptional({ enum: PropertyStatus, example: 'AVAILABLE' })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional({
    description: 'Project status shown to buyers',
    enum: ['CURRENT', 'UPCOMING', 'COMPLETED'],
    example: 'CURRENT',
  })
  @IsOptional()
  @IsEnum(['CURRENT', 'UPCOMING', 'COMPLETED'])
  project_status?: 'CURRENT' | 'UPCOMING' | 'COMPLETED';

  // ==================== CATEGORY ====================
  @ApiPropertyOptional({ description: 'Property category ID' })
  @IsOptional()
  @IsUUID()
  property_category_id?: string;


  @ApiPropertyOptional({ description: 'Property category name' })
  @IsOptional()
  @IsString()
  property_category_name?: string;

  // ==================== LOCATION FILTERS ====================
  @ApiPropertyOptional({ description: 'City name', example: 'Chennai' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'District name', example: 'Chennai' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'State name', example: 'Tamil Nadu' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Postal code', example: '600040' })
  @IsOptional()
  @IsString()
  postal_code?: string;

  // ==================== PRICE FILTERS ====================
  @ApiPropertyOptional({ description: 'Minimum price', example: 5000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price_min?: number;

  @ApiPropertyOptional({ description: 'Maximum price', example: 15000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price_max?: number;

  // ==================== SIZE FILTERS ====================
  @ApiPropertyOptional({ description: 'Minimum property size', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  size_min?: number;

  @ApiPropertyOptional({ description: 'Maximum property size', example: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  size_max?: number;

  // ==================== LAYOUT FILTERS (NEW) ====================
  @ApiPropertyOptional({ description: 'Layout price minimum', example: 3000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  layout_price_min?: number;

  @ApiPropertyOptional({ description: 'Layout price maximum', example: 10000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  layout_price_max?: number;

  @ApiPropertyOptional({ description: 'Layout area minimum (sqft)', example: 800 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  layout_area_min_sqft?: number;

  @ApiPropertyOptional({ description: 'Layout area maximum (sqft)', example: 2400 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  layout_area_max_sqft?: number;

  @ApiPropertyOptional({ description: 'Plot total count min', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_total_count_min?: number;

  @ApiPropertyOptional({ description: 'Plot total count max', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_total_count_max?: number;

  @ApiPropertyOptional({ description: 'Plot sold count min', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_sold_count_min?: number;

  @ApiPropertyOptional({ description: 'Plot sold count max', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_sold_count_max?: number;

  @ApiPropertyOptional({ description: 'Plot booked count min', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_booked_count_min?: number;

  @ApiPropertyOptional({ description: 'Plot booked count max', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_booked_count_max?: number;

  @ApiPropertyOptional({ description: 'Plot available count min', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_available_count_min?: number;

  @ApiPropertyOptional({ description: 'Plot available count max', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plot_available_count_max?: number;

  @ApiPropertyOptional({ description: 'Layout total sqft min', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  layout_total_sqft_min?: number;

  @ApiPropertyOptional({ description: 'Layout total sqft max', example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  layout_total_sqft_max?: number;

  // ==================== DYNAMIC FEATURE FILTERS ====================
  // Accept comma-separated values: bhk=2,3 or amenities=Gym,Pool

  @ApiPropertyOptional({
    description: 'BHK filter (comma-separated)',
    example: '2,3'
  })
  @IsOptional()
  @IsString()
  bhk?: string;

  @ApiPropertyOptional({ description: 'Bathrooms filter (comma-separated)' })
  @IsOptional()
  @IsString()
  bathrooms?: string;

  @ApiPropertyOptional({
    description: 'Furnishing filter (comma-separated)',
    example: 'Fully-Furnished,Semi-Furnished'
  })
  @IsOptional()
  @IsString()
  furnishing?: string;

  @ApiPropertyOptional({ description: 'Facing filter (comma-separated)' })
  @IsOptional()
  @IsString()
  facing?: string;

  @ApiPropertyOptional({
    description: 'Parking filter (comma-separated)',
    example: 'Covered,Two Wheeler'
  })
  @IsOptional()
  @IsString()
  parking?: string;

  @ApiPropertyOptional({
    description: 'Amenities filter (comma-separated)',
    example: 'Swimming Pool,Gym,Power Backup'
  })
  @IsOptional()
  @IsString()
  amenities?: string;

  // ==================== GEO FILTERS ====================
  @ApiPropertyOptional({
    description: 'Latitude for radius search',
    example: 13.0827
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({
    description: 'Longitude for radius search',
    example: 80.2707
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lon?: number;

  @ApiPropertyOptional({
    description: 'Search radius (with unit)',
    example: '10km',
    default: '10km'
  })
  @IsOptional()
  @IsString()
  radius?: string = '10km';

  // ==================== BOOLEAN FLAGS ====================
  @ApiPropertyOptional({ description: 'Only verified properties' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_verified?: boolean;

  @ApiPropertyOptional({ description: 'Only premium properties' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_premium?: boolean;

  @ApiPropertyOptional({ description: 'Only featured properties' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_featured?: boolean;

  @ApiPropertyOptional({ description: 'Only properties that have a promotional offer' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  has_offer?: boolean;

  // ==================== OWNER/AGENT FILTERS ====================
  @ApiPropertyOptional({ description: 'Filter by owner ID' })
  @IsOptional()
  @IsUUID()
  owner_id?: string;

  @ApiPropertyOptional({ description: 'Filter by agent ID' })
  @IsOptional()
  @IsUUID()
  agent_id?: string;

  // ==================== RESPONSE OPTIONS ====================
  @ApiPropertyOptional({
    description: 'Include filter aggregations in response',
    default: false
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_filters?: boolean = false;
}

export class PropertyAutocompleteDto {
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

  @ApiPropertyOptional({ enum: ListingType })
  @IsOptional()
  @IsEnum(ListingType)
  listing_type?: ListingType;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by property category' })
  @IsOptional()
  @IsUUID()
  property_category_id?: string;
}

export function parseCommaSeparated(
  value: string | undefined
): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}
