import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Newsletter } from './entities/newsletter.entity';
import { User } from '../users/entities/user.entity';
import { NewsletterService } from './services/newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { UsersModule } from '../users/users.module';

const services = [NewsletterService];

@Module({
  imports: [
    TypeOrmModule.forFeature([Newsletter, User]),
    UsersModule
  ],
  controllers: [NewsletterController],
  providers: services,
  exports: services
})
export class NewsletterModule {}

