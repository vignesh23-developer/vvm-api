import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateUserWalletDto {
  @ApiProperty({ example: 'user-101' })
  @IsString()
  user_id: string;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @IsOptional()
  balance?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateUserWalletDto {
  @ApiPropertyOptional({ example: 150.0 })
  @IsNumber()
  @IsOptional()
  balance?: number;

  @ApiPropertyOptional({ example: 350.0 })
  @IsNumber()
  @IsOptional()
  lifetime_credited?: number;

  @ApiPropertyOptional({ example: 200.0 })
  @IsNumber()
  @IsOptional()
  lifetime_debited?: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @IsOptional()
  lifetime_expired?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateWalletBalanceDto {
  @ApiProperty({ example: 100.0 })
  @IsNumber()
  amount: number;
}


