import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserWallet } from '../../entities/user-wallets.entity';
import {
  CreateUserWalletDto,
  UpdateUserWalletDto
} from '../dto/user-wallets.dto';

@Injectable()
export class UserWalletsService {
  constructor(
    @InjectRepository(UserWallet)
    private readonly userWalletRepo: Repository<UserWallet>
  ) {}

  /**
   * Find wallet by user ID
   * Auto-creates wallet if not exists
   */
  async findOneByUserId(userId: string): Promise<UserWallet> {
    let wallet = await this.userWalletRepo.findOne({
      where: { user_id: userId }
    });
    if (!wallet) {
      wallet = await this.create({ user_id: userId });
    }
    return wallet;
  }

  /**
   * Find wallet by wallet ID
   */
  async findOne(walletId: string): Promise<UserWallet> {
    const wallet = await this.userWalletRepo.findOne({
      where: { id: walletId }
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  /**
   * Get wallet balance for user
   */
  async getBalance(userId: string): Promise<number> {
    const wallet = await this.userWalletRepo.findOne({
      where: { user_id: userId },
      select: ['balance']
    });

    return wallet?.balance ?? 0;
  }

  /**
   * Create a new user wallet
   */
  async create(dto: CreateUserWalletDto): Promise<UserWallet> {
    const entity = this.userWalletRepo.create({
      user_id: dto.user_id,
      balance: dto.balance || 0,
      lifetime_credited: 0,
      lifetime_debited: 0,
      lifetime_expired: 0,
      is_active: dto.is_active !== undefined ? dto.is_active : true
    } as any);
    const saved = await this.userWalletRepo.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  /**
   * Update wallet
   */
  async update(userId: string, dto: UpdateUserWalletDto): Promise<UserWallet> {
    const wallet = await this.findOneByUserId(userId);
    await this.userWalletRepo.update(wallet.id, dto as any);
    return this.findOneByUserId(userId);
  }

  /**
   * Update wallet balance
   */
  async updateBalance(userId: string, newBalance: number): Promise<UserWallet> {
    return this.update(userId, { balance: newBalance } as any);
  }

  /**
   * Decrement wallet balance (for payment usage)
   */
  async decrementBalance(userId: string, amount: number): Promise<UserWallet> {
    const wallet = await this.findOneByUserId(userId);
    // Convert decimal strings to numbers to avoid string concatenation
    const currentBalance = Number(wallet.balance) || 0;
    const currentLifetimeDebited = Number(wallet.lifetime_debited) || 0;
    const newBalance = Math.max(0, currentBalance - amount);
    const newLifetimeDebited = currentLifetimeDebited + amount;
    return this.update(userId, {
      balance: newBalance,
      lifetime_debited: newLifetimeDebited
    } as any);
  }

  /**
   * Increment wallet balance (for credits/refunds)
   */
  async incrementBalance(userId: string, amount: number): Promise<UserWallet> {
    const wallet = await this.findOneByUserId(userId);
    // Convert decimal strings to numbers to avoid string concatenation
    const currentBalance = Number(wallet.balance) || 0;
    const currentLifetimeCredited = Number(wallet.lifetime_credited) || 0;
    const newBalance = currentBalance + amount;
    const newLifetimeCredited = currentLifetimeCredited + amount;
    return this.update(userId, {
      balance: newBalance,
      lifetime_credited: newLifetimeCredited
    } as any);
  }

  /**
   * Update lifetime stats
   */
  async updateLifetimeStats(
    userId: string,
    stats: {
      lifetime_credited?: number;
      lifetime_debited?: number;
      lifetime_expired?: number;
    }
  ): Promise<UserWallet> {
    return this.update(userId, stats as any);
  }

  /**
   * Increment lifetime expired (for expired cashback)
   */
  async incrementLifetimeExpired(
    userId: string,
    amount: number
  ): Promise<UserWallet> {
    const wallet = await this.findOneByUserId(userId);
    // Convert decimal string to number to avoid string concatenation
    const currentLifetimeExpired = Number(wallet.lifetime_expired) || 0;
    const newLifetimeExpired = currentLifetimeExpired + amount;
    return this.update(userId, { lifetime_expired: newLifetimeExpired } as any);
  }

  /**
   * Activate/deactivate wallet
   */
  async setActiveStatus(
    userId: string,
    isActive: boolean
  ): Promise<UserWallet> {
    return this.update(userId, { is_active: isActive } as any);
  }
}
