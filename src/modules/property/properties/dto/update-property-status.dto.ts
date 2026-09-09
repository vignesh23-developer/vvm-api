// src/modules/property/properties/dto/update-property-status.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum PropertyStatus {
  AVAILABLE = 'AVAILABLE',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
  PENDING_SALE = 'PENDING_SALE',
  PENDING_RENT = 'PENDING_RENT',
  UNDER_NEGOTIATION = 'UNDER_NEGOTIATION',
  WITHDRAWN = 'WITHDRAWN'
}

export class UpdatePropertyStatusDto {
  @ApiProperty({
    enum: PropertyStatus,
    example: PropertyStatus.SOLD,
    description: 'New status for the property'
  })
  @IsEnum(PropertyStatus)
  @IsNotEmpty()
  status: PropertyStatus;

  @ApiProperty({
    example: 'Property sold to Mr. Kumar',
    description: 'Optional note/reason for status change',
    required: false
  })
  @IsString()
  @IsOptional()
  note?: string;
}