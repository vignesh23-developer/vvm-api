import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription } from '../../entities/user-subscription.entity';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';
import { SubscriptionPlanItem } from '../../entities/subscription-plan-item.entity';
import { SubscriptionItem } from '../../entities/subscription-item.entity';
import { UserSubscriptionUsage } from '../../entities/user-subscription-usage.entity';
import { UserPurchasedItem } from '../../entities/user-purchased-item.entity';

/**
 * Pure DB lifecycle operations.
 * These methods intentionally do NOT call Razorpay.
 * They implement the 8 lifecycle operations you requested.
 */
@Injectable()
export class SubscriptionLifecycleService {
  constructor(
    @InjectRepository(UserSubscription) private readonly subRepo: Repository<UserSubscription>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(SubscriptionPlanItem) private readonly planItemRepo: Repository<SubscriptionPlanItem>,
    @InjectRepository(SubscriptionItem) private readonly itemRepo: Repository<SubscriptionItem>,
    @InjectRepository(UserSubscriptionUsage) private readonly usageRepo: Repository<UserSubscriptionUsage>,
    @InjectRepository(UserPurchasedItem) private readonly purchasedRepo: Repository<UserPurchasedItem>,
  ) {}

  /**
   * Create initial subscription (first time subscribe).
   * If you already have a create flow in UserSubscriptionService, calling code can call that instead.
   */
  async createInitialSubscription(userId: string, planId: number, opts?: { startDate?: Date; endDate?: Date; paidAmount?: number; transactionId?: string }): Promise<UserSubscription> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const startDate = opts?.startDate ?? new Date();
    const endDate = opts?.endDate ?? (() => { const d = new Date(startDate); d.setDate(d.getDate() + plan.durationDays); return d; })();

    const entity = this.subRepo.create({
      user_id: userId,
      plan_id: plan.id,
      startDate,
      endDate,
      autoRenew: false,
      paidAmount: opts?.paidAmount ?? plan.price,
      paymentStatus: opts?.paidAmount ? 'paid' : 'pending',
      transactionId: opts?.transactionId ?? null,
      isActive: true,
      status: 'active',
    } as any);

    const saved = await this.subRepo.save(entity as any);

    // Create usage rows for plan items (if you want pre-populated usages)
    const planItems = await this.planItemRepo.find({ where: { plan_id: plan.id } });
    for (const pi of planItems) {
      const usage = this.usageRepo.create({
        user_subscription_id: saved.id,
        item_id: pi.item_id,
        usageCount: 0,
        isActive: true,
      } as any);
      // do not await serially to keep it simple - but we will await
      await this.usageRepo.save(usage);
    }

    return saved;
  }

  /**
   * Renew: create a new UserSubscription row for the same plan.
   * Old subscription remains in DB (optionally mark isActive=false).
   */
  async handleRenewal(userId: string, planId: number): Promise<UserSubscription> {
    // find current active subscription for user+plan (optional)
    const now = new Date();
    const activeSub = await this.subRepo.findOne({ where: { user_id: userId, plan_id: planId, isActive: true } });
    // mark previous as inactive if you want (some systems leave it)
    if (activeSub) {
      await this.subRepo.update(activeSub.id, { isActive: false, status: 'expired' } as any);
    }

    // create new subscription row
    return this.createInitialSubscription(userId, planId, { startDate: now });
  }

  /**
   * Upgrade with proration:
   * - compute prorated difference on remaining time
   * - do NOT delete old subscription row (mark it inactive)
   * - create new subscription with same cycle (endDate adjusted to same relative end or new cycle)
   *
   * Note: This method assumes payment was handled by billing layer. It only updates DB.
   */
  async handleUpgradeProrated(userSubscription: UserSubscription, newPlanId: number, paidAmount?: number): Promise<UserSubscription> {
    if (!userSubscription) throw new BadRequestException('Current subscription required');
    
    console.log('Lifecycle - Upgrading subscription:', userSubscription.id, 'to plan:', newPlanId);
    
    const oldPlan = await this.planRepo.findOne({ where: { id: userSubscription.plan_id } });
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!newPlan) throw new NotFoundException('New plan not found');

    // mark old subscription inactive (keep it for history)
    await this.subRepo.update(userSubscription.id, { isActive: false, status: 'upgraded' } as any);
    
    console.log('Lifecycle - Marked subscription', userSubscription.id, 'as inactive');

    // compute remaining days and start a new subscription that continues from now until remaining period of old plan
    const now = new Date();
    const remainingMs = userSubscription.endDate.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    // Option A: keep same endDate as old sub (pro-rate for remaining days)
    const newEnd = new Date(now);
    newEnd.setDate(newEnd.getDate() + remainingDays);

    // create new subscription with new plan for the remaining period
    const entity = this.subRepo.create({
      user_id: userSubscription.user_id,
      plan_id: newPlan.id,
      startDate: now,
      endDate: newEnd,
      autoRenew: userSubscription.autoRenew,
      paidAmount: paidAmount ?? 0,
      paymentStatus: 'paid',
      transactionId: null,
      isActive: true,
      status: 'active',
    } as any);

    const saved = await this.subRepo.save(entity as any);

    // initialize usage rows for the new subscription based on new plan items
    const planItems = await this.planItemRepo.find({ where: { plan_id: newPlan.id } });
    for (const pi of planItems) {
      const usage = this.usageRepo.create({
        user_subscription_id: saved.id,
        item_id: pi.item_id,
        usageCount: 0,
        isActive: true,
      } as any);
      await this.usageRepo.save(usage);
    }

    return saved;
  }

  /**
   * Upgrade with full charge: deactivate old subscription immediately,
   * create a fresh subscription starting today for the new plan.
   */
  async handleUpgradeFullCharge(userSubscription: UserSubscription, newPlanId: number): Promise<UserSubscription> {
    if (!userSubscription) throw new BadRequestException('Current subscription required');
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!newPlan) throw new NotFoundException('New plan not found');

    // deactivate old subscription
    await this.subRepo.update(userSubscription.id, { isActive: false, status: 'upgraded_immediate' } as any);

    // create new subscription from today with full cycle
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + newPlan.durationDays);

    const entity = this.subRepo.create({
      user_id: userSubscription.user_id,
      plan_id: newPlan.id,
      startDate: start,
      endDate: end,
      autoRenew: userSubscription.autoRenew,
      paidAmount: 0,
      paymentStatus: 'paid',
      transactionId: null,
      isActive: true,
      status: 'active',
    } as any);

    const saved = await this.subRepo.save(entity as any);

    // initialize usage rows for the new subscription
    const planItems = await this.planItemRepo.find({ where: { plan_id: newPlan.id } });
    for (const pi of planItems) {
      const usage = this.usageRepo.create({
        user_subscription_id: saved.id,
        item_id: pi.item_id,
        usageCount: 0,
        isActive: true,
      } as any);
      await this.usageRepo.save(usage);
    }

    return saved;
  }

  /**
   * Downgrade scheduled at period end:
   * - Mark the subscription with a pending downgrade plan id
   * - Keep subscription active till endDate
   */
  async scheduleDowngradeAtPeriodEnd(userSubscription: UserSubscription, newPlanId: number): Promise<UserSubscription> {
    if (!userSubscription) throw new BadRequestException('Current subscription required');
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!newPlan) throw new NotFoundException('New plan not found');

    await this.subRepo.update(userSubscription.id, { status: 'downgrade_pending' } as any);
    const subscription = await this.subRepo.findOne({ where: { id: userSubscription.id } });
    return subscription as UserSubscription;
  }

  /**
   * Immediate downgrade: deactivate old subscription and create a new, cheaper subscription.
   * NOTE: may involve refund/credit handling in billing layer; this is DB-only.
   */
  async handleImmediateDowngrade(userSubscription: UserSubscription, newPlanId: number, paidAmount?: number): Promise<UserSubscription> {
    if (!userSubscription) throw new BadRequestException('Current subscription required');
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!newPlan) throw new NotFoundException('New plan not found');

    // Deactivate old subscription
    await this.subRepo.update(userSubscription.id, { isActive: false, status: 'downgraded_immediate' } as any);

    // Create new subscription starting today with full cycle for new plan
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + newPlan.durationDays);

    const entity = this.subRepo.create({
      user_id: userSubscription.user_id,
      plan_id: newPlan.id,
      startDate: start,
      endDate: end,
      autoRenew: userSubscription.autoRenew,
      paidAmount: paidAmount ?? 0,
      paymentStatus: 'paid',
      transactionId: null,
      isActive: true,
      status: 'active',
    } as any);

    const saved = await this.subRepo.save(entity as any);

    // initialize usage rows for the new subscription
    const planItems = await this.planItemRepo.find({ where: { plan_id: newPlan.id } });
    for (const pi of planItems) {
      const usage = this.usageRepo.create({
        user_subscription_id: saved.id,
        item_id: pi.item_id,
        usageCount: 0,
        isActive: true,
      } as any);
      await this.usageRepo.save(usage);
    }

    return saved;
  }

  /**
   * Cancel at period end: mark the subscription to be canceled at end of billing period.
   */
  async cancelAtPeriodEnd(userSubscription: UserSubscription, reason?: string): Promise<UserSubscription> {
    if (!userSubscription) throw new BadRequestException('Current subscription required');

    await this.subRepo.update(userSubscription.id, {
      cancellationReason: reason ?? null,
      status: 'cancel_pending',
    } as any);

    const subscription = await this.subRepo.findOne({ where: { id: userSubscription.id } });
    return subscription as UserSubscription;
  }

  /**
   * Immediate cancellation: deactivate now, no refund (DB-only)
   */
  async cancelImmediately(userSubscription: UserSubscription, reason?: string): Promise<UserSubscription> {
    if (!userSubscription) throw new BadRequestException('Current subscription required');

    await this.subRepo.update(userSubscription.id, {
      isActive: false,
      canceledAt: new Date(),
      cancellationReason: reason ?? null,
      status: 'canceled',
    } as any);

    const subscription = await this.subRepo.findOne({ where: { id: userSubscription.id } });
    return subscription as UserSubscription;
  }
}
