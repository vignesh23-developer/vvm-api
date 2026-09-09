import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, IsObject, IsDateString } from 'class-validator';

export class CreatePaymentOrderDto {
  @ApiProperty({ example: 'user-101' })
  @IsString()
  user_id: string;

  @ApiProperty({ example: 'RAZORPAY', enum: ['RAZORPAY', 'PHONEPE', 'PAYTM'] })
  @IsString()
  gateway: string;

  @ApiProperty({ example: 'WEB', enum: ['WEB', 'ANDROID', 'IOS', 'API'] })
  @IsString()
  channel: string;

  @ApiProperty({ example: 'SUBSCRIPTION', enum: ['SUBSCRIPTION', 'ADDON', 'PROPERTY_BOOST', 'FEATURED_LISTING'] })
  @IsString()
  purpose: string;

  @ApiPropertyOptional({ example: 'subscription_plan' })
  @IsString()
  @IsOptional()
  related_entity_type?: string;

  @ApiPropertyOptional({ example: 'plan-premium-001' })
  @IsString()
  @IsOptional()
  related_entity_id?: string;

  @ApiProperty({ example: 847.46 })
  @IsNumber()
  base_amount: number;

  @ApiProperty({ example: 18.0 })
  @IsNumber()
  tax_percent: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @IsOptional()
  discount_amount?: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @IsOptional()
  wallet_amount_used?: number;

  @ApiPropertyOptional({ example: 'BOOST50' })
  @IsString()
  @IsOptional()
  promo_code?: string;

  @ApiPropertyOptional({ example: { plan_name: 'Premium Monthly' } })
  @IsObject()
  @IsOptional()
  notes?: Record<string, any>;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsString()
  @IsOptional()
  ip_address?: string;

  @ApiPropertyOptional({ example: 'Mozilla/5.0...' })
  @IsString()
  @IsOptional()
  user_agent?: string;

  @ApiPropertyOptional({ example: '2025-01-29T10:30:00Z' })
  @IsDateString()
  @IsOptional()
  expires_at?: Date;
}

export class CreatePaymentOrderFromRazorpayDto {
  @ApiProperty({ example: 'user-101' })
  @IsString()
  user_id: string;

  @ApiProperty({ example: 'order_PxYz123456' })
  @IsString()
  gateway_order_id: string;

  @ApiProperty({ example: 'WEB', enum: ['WEB', 'ANDROID', 'IOS', 'API'] })
  @IsString()
  channel: string;

  @ApiProperty({ example: 'SUBSCRIPTION', enum: ['SUBSCRIPTION', 'ADDON', 'PROPERTY_BOOST', 'FEATURED_LISTING'] })
  @IsString()
  purpose: string;

  @ApiPropertyOptional({ example: 'subscription_plan' })
  @IsString()
  @IsOptional()
  related_entity_type?: string;

  @ApiPropertyOptional({ example: 'plan-premium-001' })
  @IsString()
  @IsOptional()
  related_entity_id?: string;

  @ApiProperty({ example: 847.46 })
  @IsNumber()
  base_amount: number;

  @ApiProperty({ example: 18.0 })
  @IsNumber()
  tax_percent: number;

  @ApiProperty({ example: 152.54 })
  @IsNumber()
  tax_amount: number;

  @ApiProperty({ example: 1000.0 })
  @IsNumber()
  subtotal: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @IsOptional()
  discount_amount?: number;

  @ApiPropertyOptional({ example: 100.0 })
  @IsNumber()
  @IsOptional()
  wallet_amount_used?: number;

  @ApiProperty({ example: 900.0 })
  @IsNumber()
  payable_amount: number;

  @ApiPropertyOptional({ example: 'BOOST50' })
  @IsString()
  @IsOptional()
  promo_code?: string;

  @ApiPropertyOptional({ example: { actionType: 'subscribe', plan_id: 1 } })
  @IsObject()
  @IsOptional()
  notes?: Record<string, any>;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsString()
  @IsOptional()
  ip_address?: string;

  @ApiPropertyOptional({ example: 'Mozilla/5.0...' })
  @IsString()
  @IsOptional()
  user_agent?: string;

  @ApiPropertyOptional({ example: '2025-01-29T10:30:00Z' })
  @IsDateString()
  @IsOptional()
  expires_at?: Date;
}

export class UpdatePaymentOrderDto {
  @ApiPropertyOptional({ example: 'PROCESSING' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'order_PxYz123456' })
  @IsString()
  @IsOptional()
  gateway_order_id?: string;

  @ApiPropertyOptional({ example: '2025-01-29T10:05:00Z' })
  @IsDateString()
  @IsOptional()
  completed_at?: Date;

  @ApiPropertyOptional({ example: { additional_info: 'value' } })
  @IsObject()
  @IsOptional()
  notes?: Record<string, any>;
}


