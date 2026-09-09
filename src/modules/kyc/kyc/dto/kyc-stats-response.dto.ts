import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KycStatsResponseDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  verified: number;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  failed: number;

  @ApiProperty()
  expired: number;

  @ApiProperty({
    description: 'Breakdown by verification type',
    example: { AADHAAR: { total: 100, verified: 80 } }
  })
  byType: Record<string, { total: number; verified: number }>;
}