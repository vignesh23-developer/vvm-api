import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { User } from '../users/entities/user.entity';
import { ReviewService } from './services/review.service';
import { ReviewController } from './review.controller';
import { AuthModule } from '../auth';

const services = [ReviewService];

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Review, User])
  ],
  controllers: [ReviewController],
  providers: services,
  exports: services
})
export class ReviewsModule {}

