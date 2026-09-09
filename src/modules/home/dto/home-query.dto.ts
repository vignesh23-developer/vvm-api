import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class HomeQueryDto {
  @ApiPropertyOptional({ default: 8, description: 'Number of featured properties' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  properties_limit: number = 8;

  @ApiPropertyOptional({ default: 6, description: 'Number of featured ads' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  ads_limit: number = 6;

  @ApiPropertyOptional({ default: 5, description: 'Number of testimonials' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  reviews_limit: number = 5;

  @ApiPropertyOptional({ default: 10, description: 'Number of districts' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  districts_limit: number = 10;
}