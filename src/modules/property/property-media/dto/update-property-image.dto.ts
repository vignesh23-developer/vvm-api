import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min
} from 'class-validator';

export class UpdatePropertyImageDto {
  @ApiProperty({ example: 0, required: false, description: 'Sort order' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sort_order?: number;

  @ApiProperty({ example: false, required: false, description: 'Is primary image' })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiProperty({ example: 'Product image', required: false, description: 'Alt text for accessibility' })
  @IsOptional()
  @IsString()
  alt_text?: string;
}