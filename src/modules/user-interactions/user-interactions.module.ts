import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from '../property/entities/properties.entity';
import { Favorite } from './entities/favorite.entity';
import { Enquiry } from './entities/enquiry.entity';
import { LeadStatus } from './entities/lead-status.entity';
import { FavoriteController } from './favorite/favorite.controller';
import { EnquiryController } from './enquiry/enquiry.controller';
import { FavoriteService } from './favorite/services/favorite.service';
import { EnquiryService } from './enquiry/services/enquiry.service';
import { Ad } from '../ads/entities/ad.entity';
import { NotificationModule } from '../notification/notification.module';
import { User } from '../users/entities/user.entity';

const services = [
  FavoriteService,
  EnquiryService,
];

@Module({
  imports: [
    NotificationModule,
    TypeOrmModule.forFeature([
      Favorite,
      Enquiry,
      LeadStatus,
      Property,
      Ad,
      User
    ]),
  ],
  controllers: [
    FavoriteController,
    EnquiryController,
  ],
  providers: services,
  exports: [
    ...services,
    TypeOrmModule,
  ],
})
export class UserInteractionsModule {}
