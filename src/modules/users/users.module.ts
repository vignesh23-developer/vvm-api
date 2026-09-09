import { Module } from '@nestjs/common';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/services/profile.service';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/services/roles.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Role } from './entities';
import { AgentCompanyProfileController } from './company-profile/agent-company-profile.controller';
import { AgentCompanyProfileService } from './company-profile/service/agent-company-profile.service';
import { AgentCompanyProfile } from './entities/agent-company-profile.entity';
import { AgentStatsService } from './company-profile/service/agent-stats.service';
import { Property } from '../property/entities/properties.entity';
import { Enquiry } from '../user-interactions/entities/enquiry.entity';
import { LeadStatus } from '../user-interactions/entities/lead-status.entity';
import { EntityView } from '../user-interactions/entities/entity-view.entity';
import { Favorite } from '../user-interactions/entities/favorite.entity';
import { PaymentModule } from '../payment/payment.module';

const services = [
  ProfileService,
  RolesService,
  AgentCompanyProfileService,
  AgentStatsService
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      AgentCompanyProfile,
      Property,
      Enquiry, // Make sure this is included
      LeadStatus,
      EntityView,
      Favorite
    ]),
    PaymentModule
  ],
  controllers: [
    ProfileController,
    RolesController,
    AgentCompanyProfileController
  ],
  providers: services,
  exports: [...services, TypeOrmModule]
})
export class UsersModule {}
