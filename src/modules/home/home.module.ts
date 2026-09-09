import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeController } from './home.controller';
import { HomeService } from './services/home.service';
import { Property } from '../property/entities/properties.entity';
import { Ad } from '../ads/entities/ad.entity';
import { Review } from '../reviews/entities/review.entity';
import { PropertyCategory } from '../master/entities/property-category.entity';
import { User } from '../users';
import { Enquiry } from '../user-interactions/entities/enquiry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Property,
      Ad,
      Review,
      PropertyCategory,
      User,
      Enquiry
    ])
  ],
  controllers: [HomeController],
  providers: [HomeService],
  exports: [HomeService]
})
export class HomeModule {}