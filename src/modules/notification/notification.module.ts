import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';

import {
  Notification,
  MessagingTemplate,
  NotificationLog,
  NotificationPreference
} from './entities';

import { TemplateService } from './services/template.service';
import { QuotaService } from './services/quota.service';
import { PreferenceService } from './services/preference.service';
import { PushService } from './services/push.service';
import { EventEmitterService } from './services/event-emitter.service';
import { NotificationService } from './services/notification.service';

import { NotificationController } from './controllers/notification.controller';
import { AdminNotificationController } from './controllers/admin-notification.controller';

import { SharedModule } from '../shared/shared.module';
import { DeviceSession } from '../shared';
import { UserSubscription } from '../subscription/entities/user-subscription.entity';
import { SubscriptionPlanItem } from '../subscription/entities/subscription-plan-item.entity';
import { UserSubscriptionUsage } from '../subscription/entities/user-subscription-usage.entity';
import { Ad } from '../ads/entities/ad.entity';
import { Property } from '../property/entities/properties.entity';
import { PropertyReport } from '../property/entities/property-report.entity';
import { AdReport } from '../ads/entities/ad-report.entity';
import { Favorite } from '../user-interactions/entities/favorite.entity';
import { Enquiry } from '../user-interactions/entities/enquiry.entity';
import { KycVerification } from '../kyc';
import { UserWallet } from '../payment/entities/user-wallets.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Notification entities
      Notification,
      MessagingTemplate,
      NotificationLog,
      NotificationPreference,
      // Related entities
      DeviceSession,
      UserSubscription,
      SubscriptionPlanItem,
      UserSubscriptionUsage,
      Property, Ad, PropertyReport, AdReport, Favorite, Enquiry,
      KycVerification, UserWallet
    ]),
    CacheModule.register({
      ttl: 3600, // 1 hour default
    }),
    SharedModule, // For EmailService, SmsService, WhatsAppService
  ],
  controllers: [
    NotificationController,
    AdminNotificationController,
  ],
  providers: [
    TemplateService,
    QuotaService,
    PreferenceService,
    PushService,
    EventEmitterService,
    NotificationService,
  ],
  exports: [
    TemplateService,
    QuotaService,
    PreferenceService,
    PushService,
    EventEmitterService,
    NotificationService,
  ],
})
export class NotificationModule {}