import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsObject, IsDateString, IsEnum } from 'class-validator';

export class CreatePaymentReconciliationDto {
  @ApiProperty({ example: 'txn-001' })
  @IsString()
  payment_transaction_id: string;

  @ApiProperty({ 
    example: 'REFUND', 
    enum: ['LATE_AUTHORIZATION', 'REFUND', 'PARTIAL_REFUND', 'CHARGEBACK', 'SETTLEMENT', 'DISPUTE'] 
  })
  @IsString()
  type: string;

  @ApiProperty({ example: 900.0 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'INR' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ example: 'PENDING', enum: ['PENDING', 'PROCESSED', 'FAILED', 'REQUIRES_ACTION'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'evt_refund_123' })
  @IsString()
  @IsOptional()
  gateway_event_id?: string;

  @ApiPropertyOptional({ example: 'rfnd_PxYz999888' })
  @IsString()
  @IsOptional()
  gateway_refund_id?: string;

  @ApiPropertyOptional({ example: 'Customer requested cancellation within 24 hours' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ example: { webhook_data: 'value' } })
  @IsObject()
  @IsOptional()
  webhook_payload?: Record<string, any>;
}

export class UpdatePaymentReconciliationDto {
  @ApiPropertyOptional({ example: 'PROCESSED' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: '2025-01-31T14:00:00Z' })
  @IsDateString()
  @IsOptional()
  processed_at?: Date;

  @ApiPropertyOptional({ example: { additional_info: 'value' } })
  @IsObject()
  @IsOptional()
  webhook_payload?: Record<string, any>;
}


