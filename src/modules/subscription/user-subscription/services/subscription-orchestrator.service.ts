import { Injectable, BadRequestException } from '@nestjs/common';
import { RazorpayBillingService } from './razorpay-billing.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { UserSubscription } from '../../entities/user-subscription.entity';

/**
 * Orchestrator sits between billing verification and DB lifecycle.
 * - Interpret actionType from order.notes and call the appropriate lifecycle method
 */
@Injectable()
export class SubscriptionOrchestratorService {
  constructor(
    private readonly billing: RazorpayBillingService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  /**
   * Called after the payment is verified.
   * orderMetadata must include actionType and the relevant IDs (userId, planId, newPlanId, oldPlanId etc)
   */
  async applyActionFromOrder(order: any) {
    const meta = this.billing.extractMetadataFromOrder(order);
    const action: string = meta.actionType || meta.type || meta.action;

    if (!action) throw new BadRequestException('Order missing actionType');

    // Standardize metadata to expected fields
    const userId: string = meta.user_id || meta.userId || meta.userIdString;
    const planId: number = Number(meta.plan_id || meta.planId || meta.planIdNumber || meta.planIdString);
    const newPlanId: number = Number(meta.newPlanId || meta.new_plan_id || meta.toPlanId);
    const oldPlanId: number = Number(meta.oldPlanId || meta.old_plan_id || meta.fromPlanId);
    const subscriptionId: number = meta.subscriptionId ? Number(meta.subscriptionId) : -1 as number;

    console.log('Orchestrator - Action:', action);
    console.log('Orchestrator - UserId:', userId);
    console.log('Orchestrator - NewPlanId:', newPlanId);

    // For upgrade/downgrade, find the most recent active subscription
    let subscription: UserSubscription | null = null;
    if (['upgrade_prorated', 'upgrade_full', 'downgrade_now', 'downgrade_at_renewal', 'downgrade_later', 'cancel_at_period_end', 'cancel_later', 'cancel_now', 'cancel_immediate'].includes(action)) {
      // Find the active subscription for this user
      subscription = await this.lifecycle['subRepo'].findOne({ 
        where: { user_id: userId, isActive: true },
        order: { id: 'DESC' } // Get most recent if multiple
      }) as any;
      
      if (!subscription) {
        throw new BadRequestException(`No active subscription found for user to ${action}`);
      }
      
      console.log('Orchestrator - Found active subscription:', subscription.id, 'plan_id:', subscription.plan_id);
    }

    switch (action) {
      case 'subscribe':
      case 'initial_subscribe':
        return this.lifecycle.createInitialSubscription(userId, planId, {
          paidAmount: order?.amount_paid != null ? Number(order.amount_paid) / 100 : 0,
          transactionId: order?.id ?? null,
        });
      case 'renew':
      case 'renewal':
        return this.lifecycle.handleRenewal(userId, planId);
      case 'upgrade_prorated':
        if (!subscription) throw new BadRequestException('Missing subscriptionId for upgrade_prorated');
        return this.lifecycle.handleUpgradeProrated(
          subscription, 
          newPlanId,
          order?.amount_paid != null ? Number(order.amount_paid) / 100 : 0
        );
      case 'upgrade_full':
        if (!subscription) throw new BadRequestException('Missing subscriptionId for upgrade_full');
        return this.lifecycle.handleUpgradeFullCharge(subscription, newPlanId);
      case 'downgrade_at_renewal':
      case 'downgrade_later':
        if (!subscription) throw new BadRequestException('Missing subscriptionId for downgrade');
        return this.lifecycle.scheduleDowngradeAtPeriodEnd(subscription, newPlanId);
      case 'downgrade_now':
        if (!subscription) throw new BadRequestException('Missing subscriptionId for downgrade_now');
        return this.lifecycle.handleImmediateDowngrade(
          subscription, 
          newPlanId,
          order?.amount_paid != null ? Number(order.amount_paid) / 100 : 0
        );
      case 'cancel_at_period_end':
      case 'cancel_later':
        if (!subscription) throw new BadRequestException('Missing subscriptionId for cancel');
        return this.lifecycle.cancelAtPeriodEnd(subscription, meta.reason || null);
      case 'cancel_now':
      case 'cancel_immediate':
        if (!subscription) throw new BadRequestException('Missing subscriptionId for cancel_immediate');
        return this.lifecycle.cancelImmediately(subscription, meta.reason || null);
      default:
        throw new BadRequestException(`Unsupported action type: ${action}`);
    }
  }
}
