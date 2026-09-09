import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserWalletsService } from './services/user-wallets.service';
import { CreateUserWalletDto, UpdateUserWalletDto, UpdateWalletBalanceDto } from './dto/user-wallets.dto';

@ApiTags('user-wallets')
@Controller('user-wallets')
export class UserWalletsController {
  constructor(private readonly service: UserWalletsService) {}

  @Get('users/:userId')
  @ApiOperation({ summary: "Get user's wallet" })
  @ApiParam({ name: 'userId', example: 'user-101' })
  async getWallet(@Param('userId') userId: string) {
    const wallet = await this.service.findOneByUserId(userId);
    return { success: true, data: wallet };
  }

  @Get('users/:userId/balance')
  @ApiOperation({ summary: "Get user's wallet balance" })
  @ApiParam({ name: 'userId', example: 'user-101' })
  async getBalance(@Param('userId') userId: string) {
    const balance = await this.service.getBalance(userId);
    return { success: true, data: { balance } };
  }

  @Post()
  @ApiOperation({ summary: 'Create user wallet' })
  @ApiBody({
    type: CreateUserWalletDto,
    examples: {
      sample: {
        summary: 'Create wallet for user',
        value: {
          user_id: 'user-101',
          balance: 0,
          is_active: true,
        },
      },
    },
  })
  async create(@Body() dto: CreateUserWalletDto) {
    const wallet = await this.service.create(dto);
    return { success: true, data: wallet };
  }

  @Put('users/:userId')
  @ApiOperation({ summary: 'Update user wallet' })
  @ApiParam({ name: 'userId', example: 'user-101' })
  @ApiBody({
    type: UpdateUserWalletDto,
    examples: {
      sample: {
        summary: 'Update wallet balance and stats',
        value: {
          balance: 150.0,
          lifetime_credited: 350.0,
          lifetime_debited: 200.0,
        },
      },
    },
  })
  async update(@Param('userId') userId: string, @Body() dto: UpdateUserWalletDto) {
    const wallet = await this.service.update(userId, dto);
    return { success: true, data: wallet };
  }

  @Put('users/:userId/balance')
  @ApiOperation({ summary: 'Update wallet balance' })
  @ApiParam({ name: 'userId', example: 'user-101' })
  @ApiBody({
    type: UpdateWalletBalanceDto,
    examples: {
      sample: {
        summary: 'Update balance',
        value: {
          amount: 100.0,
        },
      },
    },
  })
  async updateBalance(@Param('userId') userId: string, @Body() dto: UpdateWalletBalanceDto) {
    const wallet = await this.service.updateBalance(userId, dto.amount);
    return { success: true, data: wallet };
  }
}


