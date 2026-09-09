import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsObject, IsDateString } from 'class-validator';

export class CreatePaymentTransactionDto {
  @ApiProperty({ example: 'ord-001' })
  @IsString()
  payment_order_id: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  attempt_number: number;

  @ApiPropertyOptional({ example: 'pay_PxYz123456abc' })
  @IsString()
  @IsOptional()
  gateway_payment_id?: string;

  @ApiPropertyOptional({ example: 'sig_abc123xyz789' })
  @IsString()
  @IsOptional()
  gateway_signature?: string;

  @ApiPropertyOptional({ example: 'UPI', enum: ['UPI', 'CARD', 'NETBANKING', 'WALLET', 'EMI'] })
  @IsString()
  @IsOptional()
  method?: string;

  @ApiPropertyOptional({ example: { vpa: 'user@okaxis', bank: 'AXIS' } })
  @IsObject()
  @IsOptional()
  method_details?: Record<string, any>;

  @ApiProperty({ example: 900.0 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'INR' })
  @IsString()
  currency: string;

  @ApiProperty({ example: 'INITIATED', enum: ['INITIATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED'] })
  @IsString()
  status: string;

  @ApiPropertyOptional({ example: 'BAD_REQUEST_ERROR' })
  @IsString()
  @IsOptional()
  error_code?: string;

  @ApiPropertyOptional({ example: 'Payment failed due to insufficient funds' })
  @IsString()
  @IsOptional()
  error_description?: string;

  @ApiPropertyOptional({ example: { full_response: 'data' } })
  @IsObject()
  @IsOptional()
  gateway_response?: Record<string, any>;

  @ApiPropertyOptional({ example: 18.0 })
  @IsNumber()
  @IsOptional()
  gateway_fee?: number;

  @ApiPropertyOptional({ example: 3.24 })
  @IsNumber()
  @IsOptional()
  gateway_tax?: number;

  @ApiPropertyOptional({ example: '2025-01-29T10:05:00Z' })
  @IsDateString()
  @IsOptional()
  verified_at?: Date;
}

export class VerifyPaymentTransactionDto {
  @ApiProperty({ example: 'ord-001' })
  @IsString()
  payment_order_id: string;

  @ApiProperty({ example: 'pay_PxYz123456abc' })
  @IsString()
  gateway_payment_id: string;

  @ApiProperty({ example: 'sig_abc123xyz789' })
  @IsString()
  gateway_signature: string;

  @ApiPropertyOptional({ example: 'UPI' })
  @IsString()
  @IsOptional()
  method?: string;

  @ApiPropertyOptional({ example: { vpa: 'user@okaxis' } })
  @IsObject()
  @IsOptional()
  method_details?: Record<string, any>;

  @ApiProperty({ example: 900.0 })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ example: { full_response: 'data' } })
  @IsObject()
  @IsOptional()
  gateway_response?: Record<string, any>;
}

export class UpdatePaymentTransactionDto {
  @ApiPropertyOptional({ example: 'CAPTURED' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: '2025-01-29T10:05:00Z' })
  @IsDateString()
  @IsOptional()
  verified_at?: Date;

  @ApiPropertyOptional({ example: { additional_info: 'value' } })
  @IsObject()
  @IsOptional()
  gateway_response?: Record<string, any>;
}


