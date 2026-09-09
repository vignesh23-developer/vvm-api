import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { KycController } from './kyc/kyc.controller';
import { KycService } from './kyc/services/kyc.service';
import { KycVerification } from './entities/kyc-verification.entity';
import { KycScheduler } from './schedulers/kyc.scheduler';
import { User } from '../users/entities/user.entity';
import { SharedModule } from '../shared/shared.module';
import { PaymentModule } from '../payment/payment.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycVerification, User]),
    ConfigModule,
    ScheduleModule.forRoot(),
    SharedModule, // Contains S3StorageService and RazorpayService
    forwardRef(() => PaymentModule), // Contains PaymentOrdersService, PaymentTransactionsService, UserWalletsService
    forwardRef(() => SubscriptionModule), // Contains UserSubscriptionService
    forwardRef(() => NotificationModule),
  ],
  controllers: [KycController],
  providers: [KycService, KycScheduler],
  exports: [KycService]
})
export class KycModule {}