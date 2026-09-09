import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, Between } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { NotificationChannel, SubscriptionItemId } from '../enums/notification.enum';
import { UserSubscription } from '../../subscription/entities/user-subscription.entity';
import { SubscriptionPlanItem } from '../../subscription/entities/subscription-plan-item.entity';
import { UserSubscriptionUsage } from '../../subscription/entities/user-subscription-usage.entity';


export interface QuotaCheckResult {
  hasQuota: boolean;
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  percentUsed: number;
  resetDate: Date;
  requiresSubscription: boolean;
  hasActiveSubscription: boolean;
}

export interface QuotaIncrementResult {
  success: boolean;
  newUsed: number;
  remaining: number;
  error?: string;
}

@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(UserSubscription)
    private readonly userSubRepo: Repository<UserSubscription>,
    @InjectRepository(SubscriptionPlanItem)
    private readonly planItemRepo: Repository<SubscriptionPlanItem>,
    @InjectRepository(UserSubscriptionUsage)
    private readonly usageRepo: Repository<UserSubscriptionUsage>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotaService.name);
  }

  // ============================================
  // GET ITEM ID FOR CHANNEL
  // ============================================

  private getItemIdForChannel(channel: NotificationChannel): number | null {
    switch (channel) {
      case NotificationChannel.SMS:
        return SubscriptionItemId.SMS_QUOTA;
      case NotificationChannel.WHATSAPP:
        return SubscriptionItemId.WHATSAPP_QUOTA;
      default:
        return null;
    }
  }

  // ============================================
  // GET ACTIVE SUBSCRIPTION FOR USER
  // ============================================

  async getActiveSubscription(userId: string): Promise<UserSubscription | null> {
    const now = new Date();

    return this.userSubRepo.findOne({
      where: {
        user_id: userId,
        isActive: true,
        status: 'active',
        startDate: LessThan(now),
        endDate: MoreThan(now),
      },
      relations: ['plan'],
      order: { startDate: 'DESC' },
    });
  }

  // ============================================
  // CHECK QUOTA
  // ============================================

  async checkQuota(
    userId: string,
    channel: NotificationChannel,
  ): Promise<QuotaCheckResult> {
    const itemId = this.getItemIdForChannel(channel);

    // Channels without quota (in_app, push, email)
    if (!itemId) {
      return {
        hasQuota: true,
        used: 0,
        limit: 0,
        remaining: 0,
        isUnlimited: true,
        percentUsed: 0,
        resetDate: new Date(),
        requiresSubscription: false,
        hasActiveSubscription: true,
      };
    }

    // Get active subscription
    const subscription = await this.getActiveSubscription(userId);

    if (!subscription) {
      this.logger.debug({ userId, channel }, 'No active subscription');
      return {
        hasQuota: false,
        used: 0,
        limit: 0,
        remaining: 0,
        isUnlimited: false,
        percentUsed: 0,
        resetDate: this.getNextMonthStart(),
        requiresSubscription: true,
        hasActiveSubscription: false,
      };
    }

    // Get plan item limits
    const planItem = await this.planItemRepo.findOne({
      where: {
        plan_id: subscription.plan_id,
        item_id: itemId,
        isIncluded: true,
      },
    });

    if (!planItem) {
      this.logger.debug({ userId, channel, planId: subscription.plan_id }, 'Channel not included in plan');
      return {
        hasQuota: false,
        used: 0,
        limit: 0,
        remaining: 0,
        isUnlimited: false,
        percentUsed: 0,
        resetDate: this.getNextMonthStart(),
        requiresSubscription: true,
        hasActiveSubscription: true,
      };
    }

    // Unlimited quota
    if (planItem.isUnlimited) {
      return {
        hasQuota: true,
        used: 0,
        limit: 0,
        remaining: 0,
        isUnlimited: true,
        percentUsed: 0,
        resetDate: this.getNextMonthStart(),
        requiresSubscription: false,
        hasActiveSubscription: true,
      };
    }

    // Get current month usage
    const usage = await this.getCurrentMonthUsage(subscription.id, itemId);
    const limit = planItem.numericValue;
    const used = usage?.usedCount || 0;
    const remaining = Math.max(0, limit - used);
    const percentUsed = limit > 0 ? Math.round((used / limit) * 100) : 0;

    return {
      hasQuota: used < limit,
      used,
      limit,
      remaining,
      isUnlimited: false,
      percentUsed,
      resetDate: this.getNextMonthStart(),
      requiresSubscription: false,
      hasActiveSubscription: true,
    };
  }

  // ============================================
  // GET CURRENT MONTH USAGE
  // ============================================

  private async getCurrentMonthUsage(
    subscriptionId: number,
    itemId: number,
  ): Promise<UserSubscriptionUsage | null> {
    const { startOfMonth, endOfMonth } = this.getCurrentMonthRange();

    return this.usageRepo.findOne({
      where: {
        user_subscription_id: subscriptionId,
        item_id: itemId,
        lastUsedAt: Between(startOfMonth, endOfMonth),
      },
    });
  }

  // ============================================
  // INCREMENT USAGE
  // ============================================

  async incrementUsage(
    userId: string,
    channel: NotificationChannel,
    count: number = 1,
  ): Promise<QuotaIncrementResult> {
    const itemId = this.getItemIdForChannel(channel);

    if (!itemId) {
      // No quota tracking for this channel
      return { success: true, newUsed: 0, remaining: 0 };
    }

    try {
      const subscription = await this.getActiveSubscription(userId);

      if (!subscription) {
        return {
          success: false,
          newUsed: 0,
          remaining: 0,
          error: 'No active subscription',
        };
      }

      const { startOfMonth, endOfMonth } = this.getCurrentMonthRange();

      // Find or create usage record
      let usage = await this.usageRepo.findOne({
        where: {
          user_subscription_id: subscription.id,
          item_id: itemId,
          lastUsedAt: Between(startOfMonth, endOfMonth),
        },
      });

      if (usage) {
        // Update existing
        usage.usedCount += count;
        usage.lastUsedAt = new Date();
        await this.usageRepo.save(usage);
      } else {
        // Create new
        usage = this.usageRepo.create({
          user_subscription_id: subscription.id,
          item_id: itemId,
          usedCount: count,
          usedValue: count,
          lastUsedAt: new Date(),
          usageDetails: {
            channel,
            firstUsed: new Date().toISOString(),
          },
        });
        await this.usageRepo.save(usage);
      }

      // Get updated quota info
      const quotaInfo = await this.checkQuota(userId, channel);

      this.logger.info(
        { userId, channel, count, newUsed: quotaInfo.used },
        'Quota incremented',
      );

      return {
        success: true,
        newUsed: quotaInfo.used,
        remaining: quotaInfo.remaining,
      };
    } catch (error) {
      this.logger.error({ error, userId, channel }, 'Failed to increment quota');
      return {
        success: false,
        newUsed: 0,
        remaining: 0,
        error: error.message,
      };
    }
  }

  // ============================================
  // CHECK AND CONSUME QUOTA (Atomic)
  // ============================================

  async checkAndConsumeQuota(
    userId: string,
    channel: NotificationChannel,
  ): Promise<{ allowed: boolean; quotaInfo: QuotaCheckResult }> {
    const quotaInfo = await this.checkQuota(userId, channel);

    if (!quotaInfo.hasQuota) {
      return { allowed: false, quotaInfo };
    }

    // Increment usage
    await this.incrementUsage(userId, channel, 1);

    // Return updated quota info
    const updatedQuotaInfo = await this.checkQuota(userId, channel);

    return { allowed: true, quotaInfo: updatedQuotaInfo };
  }

  // ============================================
  // GET QUOTA SUMMARY FOR USER
  // ============================================

  async getQuotaSummary(userId: string): Promise<{
    sms: QuotaCheckResult;
    whatsapp: QuotaCheckResult;
  }> {
    const [sms, whatsapp] = await Promise.all([
      this.checkQuota(userId, NotificationChannel.SMS),
      this.checkQuota(userId, NotificationChannel.WHATSAPP),
    ]);

    return { sms, whatsapp };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getCurrentMonthRange(): { startOfMonth: Date; endOfMonth: Date } {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { startOfMonth, endOfMonth };
  }

  private getNextMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  // ============================================
  // CHECK IF SHOULD WARN ABOUT LOW QUOTA (80%)
  // ============================================

  shouldWarnLowQuota(quotaInfo: QuotaCheckResult): boolean {
    if (quotaInfo.isUnlimited) return false;
    return quotaInfo.percentUsed >= 80 && quotaInfo.percentUsed < 100;
  }

  // ============================================
  // ADMIN: GET ALL USERS NEAR QUOTA LIMIT
  // ============================================

  async getUsersNearQuotaLimit(
    channel: NotificationChannel,
    thresholdPercent: number = 80,
  ): Promise<{ userId: string; quotaInfo: QuotaCheckResult }[]> {
    const itemId = this.getItemIdForChannel(channel);
    if (!itemId) return [];

    const { startOfMonth, endOfMonth } = this.getCurrentMonthRange();

    // Get all active subscriptions with their usage
    const subscriptions = await this.userSubRepo
      .createQueryBuilder('us')
      .innerJoin('us.plan', 'p')
      .innerJoin(
        SubscriptionPlanItem,
        'spi',
        'spi.plan_id = us.plan_id AND spi.item_id = :itemId',
        { itemId },
      )
      .leftJoin(
        UserSubscriptionUsage,
        'usu',
        'usu.user_subscription_id = us.id AND usu.item_id = :itemId AND usu.lastUsedAt BETWEEN :start AND :end',
        { itemId, start: startOfMonth, end: endOfMonth },
      )
      .where('us.isActive = true')
      .andWhere('us.status = :status', { status: 'active' })
      .andWhere('spi.isUnlimited = false')
      .select([
        'us.user_id as userId',
        'spi.numericValue as quota_limit',
        'COALESCE(usu.usedCount, 0) as used',
      ])
      .getRawMany();

    const results: { userId: string; quotaInfo: QuotaCheckResult }[] = [];

    for (const sub of subscriptions) {
      const percentUsed = sub.quota_limit > 0
        ? (sub.used / sub.quota_limit) * 100
        : 0;

      if (percentUsed >= thresholdPercent) {
        const quotaInfo = await this.checkQuota(sub.userId, channel);
        results.push({ userId: sub.userId, quotaInfo });
      }
    }

    return results;
  }
}