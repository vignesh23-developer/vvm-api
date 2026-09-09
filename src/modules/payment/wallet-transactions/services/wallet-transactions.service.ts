import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { WalletTransaction } from '../../entities/wallet-transactions.entity';
import {
  CreateWalletTransactionDto,
  CreateWalletCreditDto,
  CreateWalletDebitDto,
} from '../dto/wallet-transactions.dto';

@Injectable()
export class WalletTransactionsService {
  constructor(
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepo: Repository<WalletTransaction>,
  ) {}


  async create(dto: CreateWalletTransactionDto): Promise<WalletTransaction> {
    const entity = this.walletTransactionRepo.create({
      status: 'PENDING',
      ...dto,
    } as any);
    const saved = await this.walletTransactionRepo.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
  }


  async createCredit(dto: CreateWalletCreditDto & { balance_after: number }): Promise<WalletTransaction> {
    return this.create({
      ...dto,
      type: 'CREDIT',
      status: 'COMPLETED',
    } as CreateWalletTransactionDto);
  }


  async createDebit(dto: CreateWalletDebitDto & { balance_after: number }): Promise<WalletTransaction> {
    return this.create({
      ...dto,
      type: 'DEBIT',
      status: dto.status || 'PENDING',
    } as CreateWalletTransactionDto);
  }

  async createHold(dto: {
    user_wallet_id: string;
    amount: number;
    balance_after: number;
    reference_type: string;
    reference_id: string;
    description?: string;
  }): Promise<WalletTransaction> {
    return this.createDebit({
      ...dto,
      source: 'PAYMENT_USAGE',
      status: 'HOLD',
    } as CreateWalletDebitDto & { balance_after: number });
  }

  async updateStatus(id: string, status: string): Promise<WalletTransaction> {
    const transaction = await this.findOne(id);
    await this.walletTransactionRepo.update(id, { status } as any);
    return this.findOne(id);
  }

  async markAsExpired(id: string, expiredAt: Date): Promise<WalletTransaction> {
    const transaction = await this.findOne(id);
    await this.walletTransactionRepo.update(id, {
      expired_at: expiredAt,
      status: 'EXPIRED',
    } as any);
    return this.findOne(id);
  }

  async findOne(id: string): Promise<WalletTransaction> {
    const transaction = await this.walletTransactionRepo.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('Wallet transaction not found');
    return transaction;
  }

  async findByWalletId(userWalletId: string, filters?: { type?: string; status?: string }): Promise<WalletTransaction[]> {
    const where: any = { user_wallet_id: userWalletId };
    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;
    return this.walletTransactionRepo.find({ where, order: { created_at: 'DESC' } });
  }

  async findByReference(referenceType: string, referenceId: string): Promise<WalletTransaction[]> {
    return this.walletTransactionRepo.find({
      where: { reference_type: referenceType, reference_id: referenceId },
      order: { created_at: 'DESC' },
    });
  }

  async findExpiringCredits(): Promise<WalletTransaction[]> {
    const now = new Date();
    return this.walletTransactionRepo.find({
      where: {
        type: 'CREDIT',
        status: 'COMPLETED',
        expires_at: LessThan(now),
        expired_at: IsNull(),
      },
    });
  }

  async findBySource(source: string): Promise<WalletTransaction[]> {
    return this.walletTransactionRepo.find({
      where: { source },
      order: { created_at: 'DESC' },
    });
  }
}

