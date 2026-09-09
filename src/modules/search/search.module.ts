import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchService } from './services/elasticsearch.service';
import { PropertySearchService } from './services/property-search.service';
import { PropertyIndexingService } from './services/property-indexing.service';
import { SearchController } from './controllers/search.controller';
import { SearchAdminController } from './controllers/search-admin.controller';
import { Property } from '../property/entities/properties.entity';
import { FeatureOption } from '../master/entities/feature-option.entity';
import { AdSearchService } from './services/ad-search.service';
import { AdIndexingService } from './services/ad-indexing.service';
import { Ad } from '../ads/entities/ad.entity';
import { AgentSearchService } from './services/agent-search.service';
import { AgentIndexingService } from './services/agent-indexing.service';
import { AgentCompanyProfile } from '../users/entities/agent-company-profile.entity';
import { SavedSearchService } from './saved-search/services/saved-search.service';
import { SavedSearchController } from './saved-search/saved-search.controller';
import { SavedSearch } from './entities/saved-search.entity';
import { AuthModule } from '../auth';
import { ElasticsearchIndexInitService } from './services/elasticsearch-index-init.service';
import { ThrottlerModule } from '@nestjs/throttler';
import { PropertyCategory } from '../master/entities/property-category.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Property, FeatureOption, Ad, AgentCompanyProfile, SavedSearch, PropertyCategory]),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 6,
      },
      {
        name: 'medium',
        ttl: 10000,   // 10 seconds
        limit: 40,    // 30 requests per 10 seconds
      }
    ]),
    AuthModule
  ],
  controllers: [SearchController, SearchAdminController, SavedSearchController],
  providers: [
    ElasticsearchService,
    ElasticsearchIndexInitService,
    PropertySearchService,
    PropertyIndexingService,
    AdSearchService,
    AdIndexingService,
    AgentSearchService,
    AgentIndexingService,
    SavedSearchService
  ],
  exports: [
    ElasticsearchService,
    ElasticsearchIndexInitService,
    PropertySearchService,
    PropertyIndexingService,
    AdSearchService,
    AdIndexingService,
    AgentSearchService,
    AgentIndexingService,
    SavedSearchService
  ]
})
export class SearchModule {}
