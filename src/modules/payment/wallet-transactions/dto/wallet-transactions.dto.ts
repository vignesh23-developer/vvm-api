import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class CreateWalletTransactionDto {
  @ApiProperty({ example: 'wallet-001' })
  @IsString()
  user_wallet_id: string;

  @ApiProperty({ example: 'CREDIT', enum: ['CREDIT', 'DEBIT'] })
  @IsString()
  type: string;

  @ApiProperty({ 
    example: 'REFERRAL_BONUS', 
    enum: [
      'REFERRAL_BONUS', 
      'AADHAAR_VERIFICATION', 
      'PROMOTIONAL', 
      'CASHBACK', 
      'PAYMENT_USAGE', 
      'REFUND', 
      'EXPIRED', 
      'ADMIN_CREDIT', 
      'ADMIN_DEBIT'
    ] 
  })
  @IsString()
  source: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  balance_after: number;

  @ApiPropertyOptional({ example: 'user_referral' })
  @IsString()
  @IsOptional()
  reference_type?: string;

  @ApiPropertyOptional({ example: 'ref-user-999' })
  @IsString()
  @IsOptional()
  reference_id?: string;

  @ApiPropertyOptional({ example: 'Referral bonus - user-999 signed up using your code' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'PENDING', enum: ['PENDING', 'HOLD', 'COMPLETED', 'REVERSED', 'EXPIRED'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: '2025-04-01T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  expires_at?: Date;
}

export class CreateWalletCreditDto {
  @ApiProperty({ example: 'wallet-001' })
  @IsString()
  user_wallet_id: string;

  @ApiProperty({ example: 'REFERRAL_BONUS' })
  @IsString()
  source: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ example: 'user_referral' })
  @IsString()
  @IsOptional()
  reference_type?: string;

  @ApiPropertyOptional({ example: 'ref-user-999' })
  @IsString()
  @IsOptional()
  reference_id?: string;

  @ApiPropertyOptional({ example: 'Referral bonus description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '2025-04-01T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  expires_at?: Date;
}

export class CreateWalletDebitDto {
  @ApiProperty({ example: 'wallet-001' })
  @IsString()
  user_wallet_id: string;

  @ApiProperty({ example: 'PAYMENT_USAGE' })
  @IsString()
  source: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ example: 'payment_order' })
  @IsString()
  @IsOptional()
  reference_type?: string;

  @ApiPropertyOptional({ example: 'ord-001' })
  @IsString()
  @IsOptional()
  reference_id?: string;

  @ApiPropertyOptional({ example: 'Used for Premium subscription payment' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'HOLD', enum: ['PENDING', 'HOLD', 'COMPLETED'] })
  @IsString()
  @IsOptional()
  status?: string;
}


