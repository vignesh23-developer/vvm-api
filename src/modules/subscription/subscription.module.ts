import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SubscriptionItem } from './entities/subscription-item.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { SubscriptionPlanItem } from './entities/subscription-plan-item.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { UserSubscriptionUsage } from './entities/user-subscription-usage.entity';
import { UserPurchasedItem } from './entities/user-purchased-item.entity';

import { SubscriptionItemController } from './subscription-item/subscription-item.controller';
import { SubscriptionPlanController } from './subscription-plan/subscription-plan.controller';
import { UserSubscriptionController } from './user-subscription/user-subscription.controller';
import { PublicSubscriptionController } from './public-subscription/public-subscription.controller';

import { SubscriptionItemService } from './subscription-item/services/subscription-item.service';
import { SubscriptionPlanService } from './subscription-plan/services/subscription-plan.service';
import { UserSubscriptionService } from './user-subscription/services/user-subscription.service';
import { SubscriptionFeatureService } from './subscription-feature/services/subscription-feature.service';

// NEW SERVICES
import { RazorpayBillingService } from './user-subscription/services/razorpay-billing.service';
import { SubscriptionLifecycleService } from './user-subscription/services/subscription-lifecycle.service';
import { SubscriptionOrchestratorService } from './user-subscription/services/subscription-orchestrator.service';

// Import PaymentModule to access payment services
import { PaymentModule } from '../payment/payment.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionItem,
      SubscriptionPlan,
      SubscriptionPlanItem,
      UserSubscription,
      UserSubscriptionUsage,
      UserPurchasedItem,
    ]),
    PaymentModule, // Import PaymentModule to access PaymentOrdersService and PaymentTransactionsService
    forwardRef(() => KycModule), // Import KycModule to access KycService (forwardRef to avoid circular dependency)
  ],

  controllers: [
    SubscriptionItemController,
    SubscriptionPlanController,
    UserSubscriptionController,
    PublicSubscriptionController,
  ],

  providers: [
    SubscriptionItemService,
    SubscriptionPlanService,
    UserSubscriptionService,
    SubscriptionFeatureService,

    // Register NEW 3-layer architecture
    RazorpayBillingService,
    SubscriptionLifecycleService,
    SubscriptionOrchestratorService,
  ],

  exports: [
    SubscriptionFeatureService,
    UserSubscriptionService,

    // Export these so other modules can orchestrate subscription changes
    RazorpayBillingService,
    SubscriptionLifecycleService,
    SubscriptionOrchestratorService,
  ],
})
export class SubscriptionModule {}
