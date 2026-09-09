import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WalletTransactionsService } from './services/wallet-transactions.service';
import { UserWalletsService } from '../user-wallets/services/user-wallets.service';
import {
  CreateWalletTransactionDto,
  CreateWalletCreditDto,
  CreateWalletDebitDto,
} from './dto/wallet-transactions.dto';

@ApiTags('wallet-transactions')
@Controller('wallet-transactions')
export class WalletTransactionsController {
  constructor(
    private readonly service: WalletTransactionsService,
    private readonly walletService: UserWalletsService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get wallet transaction by ID' })
  @ApiParam({ name: 'id', example: 'wtxn-001' })
  async getTransaction(@Param('id') id: string) {
    const transaction = await this.service.findOne(id);
    return { success: true, data: transaction };
  }

  @Get('wallet/:walletId')
  @ApiOperation({ summary: "Get all transactions for a wallet" })
  @ApiParam({ name: 'walletId', example: 'wallet-001' })
  @ApiQuery({ name: 'type', required: false, example: 'CREDIT', enum: ['CREDIT', 'DEBIT'] })
  @ApiQuery({ name: 'status', required: false, example: 'COMPLETED' })
  async getByWallet(
    @Param('walletId') walletId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const transactions = await this.service.findByWalletId(walletId, { type, status });
    return { success: true, data: transactions };
  }

  @Get('reference/:referenceType/:referenceId')
  @ApiOperation({ summary: 'Get transactions by reference' })
  @ApiParam({ name: 'referenceType', example: 'payment_order' })
  @ApiParam({ name: 'referenceId', example: 'ord-001' })
  async getByReference(
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
  ) {
    const transactions = await this.service.findByReference(referenceType, referenceId);
    return { success: true, data: transactions };
  }

  @Get('source/:source')
  @ApiOperation({ summary: 'Get transactions by source' })
  @ApiParam({ name: 'source', example: 'REFERRAL_BONUS' })
  async getBySource(@Param('source') source: string) {
    const transactions = await this.service.findBySource(source);
    return { success: true, data: transactions };
  }

  @Post()
  @ApiOperation({ summary: 'Create wallet transaction' })
  @ApiBody({
    type: CreateWalletTransactionDto,
    examples: {
      sample: {
        summary: 'Create a wallet transaction',
        value: {
          user_wallet_id: 'wallet-001',
          type: 'CREDIT',
          source: 'REFERRAL_BONUS',
          amount: 100.0,
          balance_after: 100.0,
          reference_type: 'user_referral',
          reference_id: 'ref-user-999',
          description: 'Referral bonus',
          expires_at: '2025-04-01T00:00:00Z',
        },
      },
    },
  })
  async create(@Body() dto: CreateWalletTransactionDto) {
    const transaction = await this.service.create(dto);
    return { success: true, data: transaction };
  }

  @Post('credit')
  @ApiOperation({ summary: 'Create wallet credit transaction' })
  @ApiBody({
    type: CreateWalletCreditDto,
    examples: {
      sample: {
        summary: 'Credit wallet',
        value: {
          user_wallet_id: 'wallet-001',
          source: 'REFERRAL_BONUS',
          amount: 100.0,
          reference_type: 'user_referral',
          reference_id: 'ref-user-999',
          description: 'Referral bonus',
          expires_at: '2025-04-01T00:00:00Z',
        },
      },
    },
  })
  async createCredit(@Body() dto: CreateWalletCreditDto) {
    // Get current wallet to calculate balance_after
    const wallet = await this.walletService.findOne(dto.user_wallet_id);
    const balanceAfter = wallet.balance + dto.amount;

    const transaction = await this.service.createCredit({
      ...dto,
      balance_after: balanceAfter,
    });

    // Update wallet balance and lifetime stats
    await this.walletService.update(wallet.user_id, {
      balance: balanceAfter,
      lifetime_credited: wallet.lifetime_credited + dto.amount,
    });

    return { success: true, data: transaction };
  }

  @Post('debit')
  @ApiOperation({ summary: 'Create wallet debit transaction' })
  @ApiBody({
    type: CreateWalletDebitDto,
    examples: {
      sample: {
        summary: 'Debit wallet',
        value: {
          user_wallet_id: 'wallet-001',
          source: 'PAYMENT_USAGE',
          amount: 100.0,
          reference_type: 'payment_order',
          reference_id: 'ord-001',
          description: 'Used for Premium subscription payment',
          status: 'HOLD',
        },
      },
    },
  })
  async createDebit(@Body() dto: CreateWalletDebitDto) {
    // Get current wallet to calculate balance_after
    const wallet = await this.walletService.findOne(dto.user_wallet_id);
    const balanceAfter = wallet.balance - dto.amount;

    const transaction = await this.service.createDebit({
      ...dto,
      balance_after: balanceAfter,
    });

    // Update wallet balance and lifetime stats (only if status is COMPLETED, not HOLD)
    if (dto.status === 'COMPLETED' || !dto.status) {
      await this.walletService.update(wallet.user_id, {
        balance: balanceAfter,
        lifetime_debited: wallet.lifetime_debited + dto.amount,
      });
    }

    return { success: true, data: transaction };
  }
}


