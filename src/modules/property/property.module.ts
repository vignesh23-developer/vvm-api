import { Module } from '@nestjs/common';
import { User } from '../users';
import { AgentCompanyProfile } from '../users/entities/agent-company-profile.entity';
import { MasterModule } from '../master';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/properties.entity';
import { PropertyReport } from './entities/property-report.entity';
import { PropertyApproval } from './entities/property-approval.entity';
import { PropertyMedia } from './entities/property-media.entity';
import { PropertyFeatureValue } from './entities/property-feature-value.entity';
import { PropertyController } from './properties/property.controller';
import { PropertyService } from './properties/services/property.service';
import { PropertyApprovalController } from './property-approval/property-approval.controller';
import { PropertyApprovalService } from './property-approval/services/property-approval.service';
import { PropertyReportController } from './property-report/property-report.controller';
import { PropertyReportService } from './property-report/services/property-report.service';
import { PropertySearchController } from './property-search/property-search.controller';
import { PropertySearchService } from './property-search/services/property-search.service';
import { PropertyMediaController } from './property-media/property-media.controller';
import { PropertyMediaService } from './property-media/services/property-media.service';
import { S3StorageService } from '../shared/storage/s3-storage.service';
import { UserInteractionsModule } from '../user-interactions/user-interactions.module';
import { AuthModule } from '../auth';
import { SearchModule } from '../search';
import { PropertyCategory } from '../master/entities/property-category.entity';
import { EntityView } from '../user-interactions/entities/entity-view.entity';
import { Enquiry } from '../user-interactions/entities/enquiry.entity';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';

const services = [
  PropertyService,
  PropertyApprovalService,
  PropertyReportService,
  PropertySearchService,
  PropertyMediaService,
  S3StorageService,
];
@Module({
  imports: [
    AuthModule,
    MasterModule,
    SearchModule,
    UserInteractionsModule,
    NotificationModule,
    PaymentModule,
    TypeOrmModule.forFeature([
      Property,
      PropertyCategory,
      PropertyReport,
      PropertyApproval,
      PropertyMedia,
      PropertyFeatureValue,
      EntityView,
      Enquiry,
      User,
      AgentCompanyProfile
    ]),
  ],
  controllers: [
    PropertyController,
    PropertyApprovalController,
    PropertyReportController,
    PropertySearchController,
    PropertyMediaController,
  ],
  providers: services,
  exports: services,
})
export class PropertyModule {}