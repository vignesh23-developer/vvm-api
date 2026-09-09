import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';

import { User } from '../users/entities/user.entity';
import { Property } from '../property/entities/properties.entity';
import { Ad } from '../ads/entities/ad.entity';
import { Enquiry } from '../user-interactions/entities/enquiry.entity';
import { Favorite } from '../user-interactions/entities/favorite.entity';
import { SavedSearch } from '../search/entities/saved-search.entity';
import { EntityView } from '../user-interactions/entities/entity-view.entity';
import { PropertyReport } from '../property/entities/property-report.entity';
import { AdReport } from '../ads/entities/ad-report.entity';
import { UserSubscription } from '../subscription/entities/user-subscription.entity';
import { LeadStatus } from '../user-interactions/entities/lead-status.entity';
import { KycVerification } from '../kyc/entities/kyc-verification.entity';
import { UserWallet } from '../payment/entities/user-wallets.entity';
import { WalletTransaction } from '../payment/entities/wallet-transactions.entity';
import { PaymentOrder } from '../payment/entities/payment-orders.entity';
import { DashboardService } from './services/dashboard.services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Property,
      Ad,
      Enquiry,
      Favorite,
      SavedSearch,
      EntityView,
      PropertyReport,
      AdReport,
      UserWallet,
      WalletTransaction,
      UserSubscription,
      PaymentOrder,
      LeadStatus,
      KycVerification
    ])
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService]
})
export class DashboardModule {}