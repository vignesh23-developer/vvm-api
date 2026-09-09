import { ApiProperty } from '@nestjs/swagger';
import { KycStatusResponseDto } from './kyc-status-response.dto';

export class PaginatedKycResponseDto {
  @ApiProperty({ type: [KycStatusResponseDto] })
  data: KycStatusResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}