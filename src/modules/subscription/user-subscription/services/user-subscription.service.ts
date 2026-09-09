import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';

import { UserSubscription } from '../../entities/user-subscription.entity';
import { SubscriptionPlanItem } from '../../entities/subscription-plan-item.entity';
import { SubscriptionItem } from '../../entities/subscription-item.entity';
import { UserSubscriptionUsage } from '../../entities/user-subscription-usage.entity';
import { UserPurchasedItem } from '../../entities/user-purchased-item.entity';
import {
  SubscribeUserDto,
  UpdateUserSubscriptionDto,
  PurchaseAddonDto
} from '../dto/user-subscription.dto';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';
import { RazorpayService } from '../../../shared/services/payment/razorpay.service';

//  NEW IMPORTS
import { RazorpayBillingService } from './razorpay-billing.service';
import { SubscriptionOrchestratorService } from './subscription-orchestrator.service';
import { PaymentOrdersService } from 'src/modules/payment/payment-orders/services/payment-orders.service';
import { PaymentTransactionsService } from 'src/modules/payment/payment-transactions/services/payment-transactions.service';
import { WalletTransactionsService } from 'src/modules/payment/wallet-transactions/services/wallet-transactions.service';
import { KycService } from 'src/modules/kyc';
import { UserWalletsService } from 'src/modules/payment/user-wallets/services/user-wallets.service';

@Injectable()
export class UserSubscriptionService {
  constructor(
    @InjectRepository(UserSubscription)
    private readonly subRepo: Repository<UserSubscription>,
    @InjectRepository(SubscriptionPlanItem)
    private readonly planItemRepo: Repository<SubscriptionPlanItem>,
    @InjectRepository(SubscriptionItem)
    private readonly itemRepo: Repository<SubscriptionItem>,
    @InjectRepository(UserSubscriptionUsage)
    private readonly usageRepo: Repository<UserSubscriptionUsage>,
    @InjectRepository(UserPurchasedItem)
    private readonly purchasedRepo: Repository<UserPurchasedItem>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,

    private readonly razorpayService: RazorpayService, // existing
    private readonly razorpayBilling: RazorpayBillingService, //  NEW
    private readonly orchestrator: SubscriptionOrchestratorService, //  NEW
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly paymentTransactionsService: PaymentTransactionsService,
    private readonly walletTransactionsService: WalletTransactionsService,
    private readonly userWalletService: UserWalletsService,
    @Inject(forwardRef(() => KycService))
    private readonly kycService: KycService
  ) { }

  async getActive(userId: string) {
    const now = new Date();
    const sub = await this.subRepo.findOne({
      where: { user_id: userId, isActive: true, endDate: MoreThanOrEqual(now) },
      relations: {
        plan: {
          planItems: {
            item: true
          }
        },
        purchasedItems: {
          item: true
        }
      }
    });
    return { success: true, data: sub || null };
  }

  async getUserAll(userId: string) {
    const subscriptions = await this.subRepo.find({
      where: { user_id: userId },
      relations: {
        plan: {
          planItems: {
            item: true
          }
        },
        purchasedItems: {
          item: true
        }
      }
    });

    // Only include purchasedItems for active subscriptions
    const processedSubscriptions = subscriptions.map((sub) => {
      if (!sub.isActive) {
        // Remove purchasedItems for inactive subscriptions
        const { purchasedItems, ...rest } = sub;
        return { ...rest, purchasedItems: [] };
      }
      return sub;
    });

    return { success: true, data: processedSubscriptions || null };
  }


  async getAll(params: {
    roles: string[];
    page: number;
    limit: number;
    orderBy: keyof UserSubscription | string;
    order: 'ASC' | 'DESC';
    status?: string;        // active | inactive | canceled | all
    paymentStatus?: string; // paid | pending | failed | all
    startDate?: string;     // filter by startDate >=
    endDate?: string;       // filter by endDate <=
    planId?: number;        // filter by plan_id
  }) {
    const {
      roles,
      page,
      limit,
      orderBy,
      order,
      status = 'all',
      paymentStatus = 'all',
      startDate,
      endDate,
      planId,
    } = params;

    // -------------------------------
    // WHERE CONDITIONS
    // -------------------------------
    const where: any = {};

    // 1. Status Rule
    if (status !== 'all') {
      if (status === 'active') where.isActive = true;
      else if (status === 'inactive') where.isActive = false;
      else where.status = status; // matches "canceled", "expired", "pending", etc
    }

    // 2. Payment Status
    if (paymentStatus !== 'all') {
      where.paymentStatus = paymentStatus;
    }

    // 3. Start Date Filter
    if (startDate) {
      where.startDate = where.startDate || {};
      where.startDate = { ...where.startDate, $gte: new Date(startDate) };
    }

    // 4. End Date Filter
    if (endDate) {
      where.endDate = where.endDate || {};
      where.endDate = { ...where.endDate, $lte: new Date(endDate) };
    }

    // 5. Plan ID Filter
    if (planId) {
      where.plan_id = planId;
    }

    // -------------------------------
    // EXECUTE QUERY
    // -------------------------------
    const [subscriptions, total] = await this.subRepo.findAndCount({
      where,
      relations: {
        plan: { planItems: { item: true } },
        purchasedItems: { item: true },
        usages: true,
      },
      order: {
        [orderBy]: order,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // -------------------------------
    // PROCESS: Remove purchasedItems if inactive
    // -------------------------------
    const processed = subscriptions.map((sub) => {
      if (!sub.isActive) {
        const { purchasedItems, ...rest } = sub;
        return { ...rest, purchasedItems: [] };
      }
      return sub;
    });

    // -------------------------------
    // RETURN RESPONSE
    // -------------------------------
    return {
      success: true,
      page,
      limit,
      total,
      data: processed,
    };
  }


  // … existing methods untouched …

  async createSubscriptionOrder(userId: string, planId: number) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const shortUser = String(userId).slice(0, 6);
    const receipt = `sub_${shortUser}_${Date.now()}`;

    let discount = 0;

    const kycStatus = await this.kycService.getMyKycStatus(userId);
    const wallet = await this.userWalletService.findOneByUserId(userId);

    if (kycStatus.isVerified && wallet.balance >= 100) {
      discount = 100;

      // Debit wallet
      await this.walletTransactionsService.createDebit({
        user_wallet_id: wallet.id,
        source: 'KYC_DEBIT',
        amount: 100,
        balance_after: wallet.balance - 100
      });

      await this.userWalletService.updateBalance(userId, wallet.balance - 100);
    }

    const finalPrice = Number(plan.price) - discount;
    const amountInPaise = Math.round(finalPrice * 100);

    const order = this.razorpayService.createOrder(
      amountInPaise,
      'INR',
      receipt,
      {
        actionType: 'subscribe',
        user_id: userId,
        plan_id: planId,
        subscriptionId: null
      }
    );

    await this.paymentOrdersService.createFromRazorpayOrder(order, {
      user_id: userId,
      base_amount: plan.price,
      purpose: 'SUBSCRIPTION',
      related_entity_type: 'subscription_plan',
      related_entity_id: String(planId),
      gateway_order_id: (await order).id,
      channel: 'WEB',
      tax_percent: 18,
      tax_amount: 0,
      subtotal: plan.price,
      payable_amount: plan.price
    });

    return order;
  }

  async createUpgradeOrder(
    userId: string,
    subscriptionId: number,
    newPlanId: number
  ) {
    // 1. Find current subscription - use provided ID or find active subscription
    let currentSub = await this.subRepo.findOne({
      where: { id: subscriptionId, user_id: userId },
      relations: ['plan']
    });

    // If not found by ID, try to find any active subscription for this user
    if (!currentSub) {
      const activeSub = await this.getActive(userId);
      if (activeSub.data) {
        currentSub = activeSub.data;
        console.log(
          'Upgrade - Using active subscription ID:',
          currentSub.id,
          'instead of provided:',
          subscriptionId
        );
      } else {
        throw new NotFoundException('No active subscription found for user');
      }
    }

    console.log(
      'Upgrade - Current subscription ID:',
      currentSub.id,
      'User:',
      userId
    );

    // 2. Find new plan
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!newPlan) throw new NotFoundException('New plan not found');

    // 3. Calculate prorated amount (without tax, Razorpay will show full breakdown)
    const now = new Date();
    const remainingMs = currentSub.endDate.getTime() - now.getTime();
    const remainingDays = Math.max(
      0,
      Math.ceil(remainingMs / (1000 * 60 * 60 * 24))
    );
    const totalDays = currentSub.plan?.durationDays || 30;

    // Daily rates
    const newDailyRate = newPlan.price / totalDays;
    const oldDailyRate = (currentSub.paidAmount || 0) / totalDays;

    // Prorated amount = (new plan daily rate - old plan daily rate) * remaining days
    const proratedAmount = Math.max(
      0,
      (newDailyRate - oldDailyRate) * remainingDays
    );

    console.log(proratedAmount);

    const shortUser = String(userId).slice(0, 6);
    const receipt = `upgrade_${shortUser}_${Date.now()}`;

    // Convert to paise (Razorpay expects amount in smallest currency unit)
    const amountInPaise = Math.round(Number(proratedAmount) * 100);

    // 4. Create Razorpay order with prorated amount
    const order = this.razorpayService.createOrder(
      amountInPaise,
      'INR',
      receipt,
      {
        actionType: 'upgrade_prorated',
        user_id: userId,
        newPlanId: newPlanId,
        subscriptionId: currentSub.id, // Use the actual current subscription ID
        oldPlanId: currentSub.plan_id,
        remainingDays: remainingDays
      }
    );

    await this.paymentOrdersService.createFromRazorpayOrder(order, {
      user_id: userId,
      base_amount: proratedAmount,
      purpose: 'SUBSCRIPTION',
      related_entity_type: 'subscription_plan',
      related_entity_id: String(newPlanId),
      gateway_order_id: (await order).id,
      channel: 'WEB',
      tax_percent: 18,
      tax_amount: 0,
      subtotal: proratedAmount,
      payable_amount: proratedAmount,
      notes: {
        actionType: 'upgrade_prorated',
        subscriptionId: subscriptionId,
        newPlanId: newPlanId,
        oldPlanId: currentSub.plan_id,
        remainingDays: remainingDays
      }
    });

    return order;
  }

  async createDowngradeOrder(
    userId: string,
    subscriptionId: number,
    newPlanId: number
  ) {
    // 1. Find current subscription - use provided ID or find active subscription
    let currentSub = await this.subRepo.findOne({
      where: { id: subscriptionId, user_id: userId },
      relations: ['plan']
    });

    // If not found by ID, try to find any active subscription for this user
    if (!currentSub) {
      const activeSub = await this.getActive(userId);
      if (activeSub.data) {
        currentSub = activeSub.data;
        console.log(
          'Downgrade - Using active subscription ID:',
          currentSub.id,
          'instead of provided:',
          subscriptionId
        );
      } else {
        throw new NotFoundException('No active subscription found for user');
      }
    }

    console.log(
      'Downgrade - Current subscription ID:',
      currentSub.id,
      'User:',
      userId
    );

    // 2. Find new plan
    const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
    if (!newPlan) throw new NotFoundException('New plan not found');

    // 3. Downgrade: charge full price of new plan, no refund/credit
    const amount = newPlan.price;

    const shortUser = String(userId).slice(0, 6);
    const receipt = `downgrade_${shortUser}_${Date.now()}`;

    // Convert to paise (Razorpay expects amount in smallest currency unit)
    const amountInPaise = Math.round(Number(amount) * 100);

    // 4. Create Razorpay order with new plan's full price
    const order = this.razorpayService.createOrder(
      amountInPaise,
      'INR',
      receipt,
      {
        actionType: 'downgrade_now',
        user_id: userId,
        newPlanId: newPlanId,
        subscriptionId: subscriptionId,
        oldPlanId: currentSub.plan_id
      }
    );

    await this.paymentOrdersService.createFromRazorpayOrder(order, {
      user_id: userId,
      base_amount: amount,
      purpose: 'SUBSCRIPTION',
      related_entity_type: 'subscription_plan',
      related_entity_id: String(newPlanId),
      gateway_order_id: (await order).id,
      channel: 'WEB',
      tax_percent: 18,
      tax_amount: 0,
      subtotal: amount,
      payable_amount: amount,
      notes: {
        actionType: 'downgrade_now',
        subscriptionId: subscriptionId,
        newPlanId: newPlanId,
        oldPlanId: currentSub.plan_id
      }
    });

    return order;
  }

  //  REPLACE THE ENTIRE verifySubscription() METHOD
  async verifySubscription(dto: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    // Step 1: Verification + fetch order via the new Billing Service
    const order = await this.razorpayBilling.verifyPayment(dto);

    // Step 2: Find payment order by gateway order ID
    const paymentOrder = await this.paymentOrdersService.findByGatewayOrderId(
      dto.razorpay_order_id
    );
    if (!paymentOrder) {
      throw new NotFoundException('Payment order not found');
    }

    // Step 3: Orchestrator decides what to do based on order.notes.actionType
    const result = await this.orchestrator.applyActionFromOrder(order);

    // Step 4: Create Payment Transaction
    await this.paymentTransactionsService.create({
      payment_order_id: paymentOrder.id, // Use our internal payment order UUID
      gateway_payment_id: dto.razorpay_payment_id,
      gateway_signature: dto.razorpay_signature,
      amount: Number(order.amount), // Amount from Razorpay order
      currency: 'INR',
      status: 'CAPTURED',
      method: order.method,
      attempt_number:
        await this.paymentTransactionsService.getNextAttemptNumber(
          paymentOrder.id
        ),
      gateway_response: order,
      verified_at: new Date()
    });

    // Step 5: Update payment order status to COMPLETED
    await this.paymentOrdersService.updateStatus(
      paymentOrder.id,
      'COMPLETED',
      new Date()
    );

    return { success: true, data: result };
  }

  // CANCEL THE SUBSCRIPTION
  async cancel(userId: string, id: number, reason?: string) {
    const row = await this.subRepo.findOne({ where: { id, user_id: userId } });
    if (!row) throw new NotFoundException('User subscription not found');
    await this.subRepo.update(id, {
      isActive: false,
      status: 'canceled',
      canceledAt: new Date(),
      cancellationReason: reason
    } as any);
    return { success: true };
  }

  // Addons
  async createAddonOrder(userId: string, itemId: number, quantity?: number) {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item || !item.isAddon)
      throw new BadRequestException('Add-on not available');

    // Determine quantity based on item type
    let finalQuantity = 1;
    if (item.valueType === 'NUMERIC') {
      finalQuantity = quantity && quantity > 0 ? quantity : 1;
    }
    // For BOOLEAN type, quantity is always 1

    // Calculate total price based on quantity
    const basePrice = Number(item.basePrice);
    const totalPrice = basePrice * finalQuantity;
    const formattedPrice = Math.round(totalPrice * 100); // Convert to paise

    const order = await this.razorpayService.createOrder(
      formattedPrice,
      'INR',
      `addon_${userId.slice(0, 6)}_${Date.now()}`,
      {
        type: 'ADDON',
        item_id: itemId,
        user_id: userId,
        quantity: finalQuantity,
        valueType: item.valueType
      }
    );

    await this.paymentOrdersService.createFromRazorpayOrder(order, {
      user_id: userId,
      base_amount: totalPrice,
      purpose: 'ADDON',
      related_entity_type: 'subscription_item',
      related_entity_id: String(itemId),
      gateway_order_id: order.id,
      channel: 'WEB',
      tax_percent: 0,
      tax_amount: 0,
      subtotal: totalPrice,
      payable_amount: totalPrice,
      notes: {
        type: 'ADDON',
        item_id: itemId,
        user_id: userId,
        quantity: finalQuantity,
        valueType: item.valueType
      }
    });

    return order;
  }

  async verifyAddon(
    userId: string,
    dto: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }
  ) {
    // Step 1: Verification + fetch order via the new Billing Service
    const order = await this.razorpayBilling.verifyPayment(dto);

    // Step 2: Find payment order by gateway order ID
    const paymentOrder = await this.paymentOrdersService.findByGatewayOrderId(
      dto.razorpay_order_id
    );
    if (!paymentOrder) {
      throw new NotFoundException('Payment order not found');
    }

    // Step 3: Get Item ID from order notes
    const itemId = order.notes?.item_id;
    if (!itemId)
      throw new BadRequestException('Invalid order: missing item details');

    // Step 4: Fetch Item
    const item = await this.itemRepo.findOne({ where: { id: Number(itemId) } });
    if (!item) throw new NotFoundException('Add-on not found');

    // Step 5: Create Payment Transaction
    const transaction = await this.paymentTransactionsService.create({
      payment_order_id: paymentOrder.id, // Use our internal payment order ID
      gateway_payment_id: dto.razorpay_payment_id,
      gateway_signature: dto.razorpay_signature,
      amount: Number(order.amount), // Amount from Razorpay order
      currency: 'INR',
      status: 'CAPTURED',
      method: order.method,
      attempt_number:
        await this.paymentTransactionsService.getNextAttemptNumber(
          paymentOrder.id
        ),
      gateway_response: order,
      verified_at: new Date()
    });

    // Step 6: Update payment order status to COMPLETED
    await this.paymentOrdersService.updateStatus(
      paymentOrder.id,
      'COMPLETED',
      new Date()
    );

    // Step 7: Find Active Subscription
    const sub = await this.getActive(userId);
    if (!sub.data)
      throw new BadRequestException('No active subscription found');

    // Step 8: Extract metadata from order notes
    const quantity = order.notes?.quantity || 1;
    const valueType = order.notes?.valueType || item.valueType;
    const paidAmount = Number(order.amount_paid) / 100; // Convert from paise to rupees

    // Step 9: Create itemSettings based on valueType
    let itemSettings: any = {
      type: valueType,
      basePrice: Number(item.basePrice),
      paidAmount: paidAmount
    };

    if (valueType === 'NUMERIC') {
      itemSettings.quantity = quantity;
    }

    // Step 10: Create Purchased Item
    const entity = this.purchasedRepo.create({
      user_subscription_id: sub.data.id,
      item_id: item.id,
      plan_item_id: null,
      startDate: new Date(),
      endDate: new Date(new Date().setDate(new Date().getDate() + 30)), // Default 30 days for now
      isActive: true,
      paidAmount: paidAmount,
      status: 'active',
      paymentStatus: 'paid',
      transactionId: transaction.id,
      appliedTo: null,
      itemSettings: itemSettings
    } as any);

    const saved = await this.purchasedRepo.save(entity as any);
    return { success: true, data: saved };
  }

  async listAddons(userId: string) {
    const items = await this.purchasedRepo.find({
      where: {
        user_subscription_id: (await this.getActive(userId)).data?.id || -1
      },
      relations: { item: true }
    });
    return { success: true, data: items };
  }

  async purchaseAddon(userId: string, dto: PurchaseAddonDto) {
    const sub = await this.subRepo.findOne({
      where: { id: dto.userSubscription_id, user_id: userId, isActive: true }
    });
    if (!sub) throw new BadRequestException('Active subscription not found');

    const item = await this.itemRepo.findOne({
      where: { id: dto.item_id, isActive: true }
    });
    if (!item || !item.isAddon)
      throw new BadRequestException('Add-on not available');

    const entity = this.purchasedRepo.create({
      user_subscription_id: sub.id,
      item_id: item.id,
      plan_item_id: null,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      isActive: true,
      paidAmount: dto.paidAmount,
      status: 'active',
      paymentStatus: dto.paymentStatus,
      transactionId: dto.transactionId,
      appliedTo: dto.appliedTo
    } as any);

    const saved = await this.purchasedRepo.save(entity as any);
    return { success: true, data: saved };
  }

  /**
   * ⚠️ TESTING ONLY - REMOVE BEFORE PRODUCTION ⚠️
   * Delete user's subscriptions and related data (for testing only)
   * Use with caution!
   */
  async deleteUserSubscription(userId: string) {
    // Find all subscription IDs for this user
    const userSubscriptions = await this.subRepo.find({
      where: { user_id: userId },
      select: ['id']
    });

    if (userSubscriptions.length === 0) {
      return { success: true, message: 'No subscriptions found for this user' };
    }

    const subscriptionIds = userSubscriptions.map((sub) => sub.id);

    // Delete in order to respect foreign key constraints
    // 1. Delete user purchased items for these subscriptions
    if (subscriptionIds.length > 0) {
      await this.purchasedRepo.delete({
        user_subscription_id: In(subscriptionIds)
      });
    }

    // 2. Delete user subscription usages for these subscriptions
    if (subscriptionIds.length > 0) {
      await this.usageRepo.delete({
        user_subscription_id: In(subscriptionIds)
      });
    }

    // 3. Delete user subscriptions
    await this.subRepo.delete({
      user_id: userId
    });

    return {
      success: true,
      message: `Deleted ${subscriptionIds.length} subscription(s) and related data for user`
    };
  }

  /**
   * Get analytics for all subscription plans
   * Returns per-plan statistics including counts, growth rates, and revenue
   */
  async getPlanAnalytics(): Promise<Array<{
    plan_id: number;
    plan_name: string;
    plan_price: number;
    total_subscriptions: number;
    active_subscriptions: number;
    expired_subscriptions: number;
    total_revenue: number;
    growth: {
      today: { count: number; growthPercentage: number };
      thisWeek: { count: number; growthPercentage: number };
      thisMonth: { count: number; growthPercentage: number };
      thisYear: { count: number; growthPercentage: number };
    };
  }>> {
    const now = new Date();
    
    // Get all active plans
    const plans = await this.planRepo.find({
      where: { isActive: true },
      select: ['id', 'name', 'price']
    });

    // Date ranges for growth calculations
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

    const calculateGrowth = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const analytics = await Promise.all(
      plans.map(async (plan) => {
        // Total subscriptions for this plan
        const totalSubscriptions = await this.subRepo.count({
          where: { plan_id: plan.id }
        });

        // Active subscriptions (isActive = true AND endDate >= now)
        const activeSubscriptions = await this.subRepo.count({
          where: {
            plan_id: plan.id,
            isActive: true,
            endDate: MoreThanOrEqual(now)
          }
        });

        // Expired subscriptions (endDate < now OR isActive = false)
        const expiredSubscriptions = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('(us.endDate < :now OR us.isActive = false)', { now })
          .getCount();

        // Total revenue (sum of paidAmount)
        const revenueResult = await this.subRepo
          .createQueryBuilder('us')
          .select('COALESCE(SUM(us.paidAmount), 0)', 'total')
          .where('us.plan_id = :planId', { planId: plan.id })
          .getRawOne();
        const totalRevenue = parseFloat(revenueResult?.total || '0');

        // Today's subscriptions
        const todayCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :todayStart', { todayStart })
          .getCount();

        // Yesterday's subscriptions
        const yesterdayCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :yesterdayStart', { yesterdayStart })
          .andWhere('us.startDate < :yesterdayEnd', { yesterdayEnd })
          .getCount();

        // This week's subscriptions
        const thisWeekCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :weekStart', { weekStart })
          .getCount();

        // Last week's subscriptions
        const lastWeekCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :lastWeekStart', { lastWeekStart })
          .andWhere('us.startDate < :lastWeekEnd', { lastWeekEnd })
          .getCount();

        // This month's subscriptions
        const thisMonthCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :monthStart', { monthStart })
          .getCount();

        // Last month's subscriptions
        const lastMonthCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :lastMonthStart', { lastMonthStart })
          .andWhere('us.startDate <= :lastMonthEnd', { lastMonthEnd })
          .getCount();

        // This year's subscriptions
        const thisYearCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :yearStart', { yearStart })
          .getCount();

        // Last year's subscriptions
        const lastYearCount = await this.subRepo
          .createQueryBuilder('us')
          .where('us.plan_id = :planId', { planId: plan.id })
          .andWhere('us.startDate >= :lastYearStart', { lastYearStart })
          .andWhere('us.startDate <= :lastYearEnd', { lastYearEnd })
          .getCount();

        return {
          plan_id: plan.id,
          plan_name: plan.name,
          plan_price: Number(plan.price),
          total_subscriptions: totalSubscriptions,
          active_subscriptions: activeSubscriptions,
          expired_subscriptions: expiredSubscriptions,
          total_revenue: totalRevenue,
          growth: {
            today: {
              count: todayCount,
              growthPercentage: calculateGrowth(todayCount, yesterdayCount),
            },
            thisWeek: {
              count: thisWeekCount,
              growthPercentage: calculateGrowth(thisWeekCount, lastWeekCount),
            },
            thisMonth: {
              count: thisMonthCount,
              growthPercentage: calculateGrowth(thisMonthCount, lastMonthCount),
            },
            thisYear: {
              count: thisYearCount,
              growthPercentage: calculateGrowth(thisYearCount, lastYearCount),
            },
          },
        };
      })
    );

    return analytics;
  }
}
