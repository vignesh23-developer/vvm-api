import { Controller, Get, Query, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ElasticsearchService } from '../services/elasticsearch.service';
import { PropertySearchService } from '../services/property-search.service';
import {
  PropertySearchDto,
  SortBy,
  ListingType,
  PropertyStatus,
  PropertyAutocompleteDto
} from '../dto/property-search.dto';
import {
  AdAutocompleteDto,
  AdSearchDto,
  AdSortBy,
  AdStatus
} from '../dto/ad-search.dto';
import { AdSearchService } from '../services/ad-search.service';
import {
  AgentAutocompleteDto,
  AgentSearchDto,
  AgentSortBy
} from '../dto/agent-search.dto';
import { AgentSearchService } from '../services/agent-search.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  SavedSearchService,
  SearchEntityType
} from '../saved-search/services/saved-search.service';
import { Throttle } from '@nestjs/throttler';
import { AutocompleteCacheService } from '../../shared/cache/autocomplete-cache.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly propertySearchService: PropertySearchService,
    private readonly adSearchService: AdSearchService,
    private readonly agentSearchService: AgentSearchService,
    private readonly savedSearchService?: SavedSearchService,
    private readonly autocompleteCacheService?: AutocompleteCacheService
  ) {}

  @Get('properties')
  @ApiOperation({
    summary: 'Search properties',
    description:
      'Search properties with text search, filters, and sorting. Returns paginated results with optional filter aggregations.'
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search text' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, enum: SortBy })
  @ApiQuery({ name: 'listing_type', required: false, enum: ListingType })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'price_min', required: false, type: Number })
  @ApiQuery({ name: 'price_max', required: false, type: Number })
  @ApiQuery({
    name: 'bhk',
    required: false,
    description: 'Comma-separated: 1,2,3'
  })
  @ApiQuery({
    name: 'amenities',
    required: false,
    description: 'Comma-separated'
  })
  @ApiQuery({ name: 'include_filters', required: false, type: Boolean })
  @ApiResponse({ status: HttpStatus.OK, description: 'Search results' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async searchProperties(
    @Query() searchDto: PropertySearchDto,
    @CurrentUser() user?: any
  ) {
    const result = await this.propertySearchService.search(searchDto);

    // Auto-save search for logged-in users (fire and forget)
    if (this.savedSearchService && user?.id) {
      this.savedSearchService
        .autoSave(user.id, SearchEntityType.PROPERTY, searchDto)
        .catch(() => {});
    }

    return result;
  }

  @Get('properties/autocomplete')
  @ApiOperation({
    summary: 'Property title/location autocomplete',
    description:
      'Get autocomplete suggestions for property search. Returns matching titles, cities, and districts.'
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search prefix (min 2 characters)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max results (default: 10)'
  })
  @ApiQuery({ name: 'listing_type', required: false, enum: ListingType })
  @ApiQuery({ name: 'city', required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Autocomplete suggestions'
  })
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  async propertyAutocomplete(@Query() dto: PropertyAutocompleteDto): Promise<{
    statusCode: number;
    data: any[];
    message: string;
    timestamp: string;
  }> {
    const filters = { listing_type: dto.listing_type, city: dto.city };
    const cached = await this.autocompleteCacheService?.get<{
      statusCode: number;
      data: any[];
      message: string;
      timestamp: string;
    }>('property', dto.q, filters);
    if (cached) {
      return cached;
    }
    const result = await this.propertySearchService.autocomplete(dto);
    await this.autocompleteCacheService?.set(
      'property',
      dto.q,
      result,
      filters
    );
    return result;
  }

  @Get('properties-filters')
  @ApiOperation({
    summary: 'Get filter options',
    description:
      'Get available filter options with counts. Useful for building filter UI.'
  })
  @ApiQuery({ name: 'listing_type', required: false, enum: ListingType })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'property_category_id', required: false })
  async getFilterOptions(
    @Query('listing_type') listing_type?: ListingType,
    @Query('city') city?: string,
    @Query('property_category_id') property_category_id?: string
  ) {
    return this.propertySearchService.getFilterOptions({
      listing_type,
      city,
      property_category_id
    });
  }

  @Get('ads')
  @ApiOperation({ summary: 'Search ads' })
  @ApiQuery({ name: 'q', required: false, description: 'Search text' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, enum: AdSortBy })
  @ApiQuery({ name: 'status', required: false, enum: AdStatus })
  @ApiQuery({ name: 'category_id', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'price_min', required: false, type: Number })
  @ApiQuery({ name: 'price_max', required: false, type: Number })
  @ApiQuery({ name: 'include_filters', required: false, type: Boolean })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ad search results' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async searchAds(@Query() searchDto: AdSearchDto, @CurrentUser() user?: any) {
    const result = await this.adSearchService.search(searchDto);

    // Auto-save search for logged-in users (fire and forget)
    if (this.savedSearchService && user?.id) {
      this.savedSearchService
        .autoSave(user.id, SearchEntityType.AD, searchDto)
        .catch(() => {});
    }

    return result;
  }

  @Get('ads/autocomplete')
  @ApiOperation({
    summary: 'Ad title/location autocomplete',
    description: 'Get autocomplete suggestions for ad search.'
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search prefix (min 2 characters)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max results (default: 10)'
  })
  @ApiQuery({ name: 'category_id', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Autocomplete suggestions'
  })
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  async adAutocomplete(@Query() dto: AdAutocompleteDto): Promise<{
    statusCode: number;
    data: any[];
    message: string;
    timestamp: string;
  }> {
    const filters = { category_id: dto.category_id, city: dto.city };
    const cached = await this.autocompleteCacheService?.get<{
      statusCode: number;
      data: any[];
      message: string;
      timestamp: string;
    }>('ad', dto.q, filters);
    if (cached) {
      return cached;
    }
    const result = await this.adSearchService.autocomplete(dto);
    await this.autocompleteCacheService?.set('ad', dto.q, result, filters);
    return result;
  }

  @Get('ads/filters')
  @ApiOperation({ summary: 'Get ad filter options' })
  async getAdFilterOptions(
    @Query('category_id') category_id?: string,
    @Query('city') city?: string
  ) {
    return this.adSearchService.search({
      category_id,
      city,
      include_filters: true,
      limit: 0
    } as AdSearchDto);
  }

  @Get('health')
  @ApiOperation({ summary: 'Get search service health' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Health status' })
  async getHealth() {
    const health = await this.elasticsearchService.getHealth();
    return {
      statusCode: 200,
      data: health,
      message: health.available
        ? 'Search service is healthy'
        : 'Search service unavailable',
      timestamp: new Date().toISOString()
    };
  }

  @Get('agents')
  @ApiOperation({ summary: 'Search agents' })
  @ApiQuery({ name: 'q', required: false, description: 'Search text' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, enum: AgentSortBy })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'is_verified', required: false, type: Boolean })
  @ApiQuery({ name: 'include_filters', required: false, type: Boolean })
  @ApiResponse({ status: HttpStatus.OK, description: 'Agent search results' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async searchAgents(
    @Query() searchDto: AgentSearchDto,
    @CurrentUser() user?: any
  ) {
    const result = await this.agentSearchService.search(searchDto);

    // Auto-save search for logged-in users (fire and forget)
    if (this.savedSearchService && user?.id) {
      this.savedSearchService
        .autoSave(user.id, SearchEntityType.AGENT, searchDto)
        .catch(() => {});
    }

    return result;
  }

  /**
   * Agent autocomplete
   */
  @Get('agents/autocomplete')
  @ApiOperation({ summary: 'Agent name autocomplete' })
  @ApiQuery({ name: 'q', required: true, description: 'Search prefix' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'city', required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Autocomplete suggestions'
  })
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  async agentAutocomplete(@Query() dto: AgentAutocompleteDto) {
    const filters = { city: dto.city };
    const cached = await this.autocompleteCacheService?.get<any>(
      'agent',
      dto.q,
      filters
    );
    if (cached) {
      return cached;
    }
    const result = await this.agentSearchService.autocomplete(dto);
    await this.autocompleteCacheService?.set('agent', dto.q, result, filters);
    return result;
  }

  /**
   * Get agent filter options
   */
  @Get('agents/filters')
  @ApiOperation({ summary: 'Get agent filter options' })
  async getAgentFilterOptions(@Query('city') city?: string) {
    return this.agentSearchService.search({
      city,
      include_filters: true,
      limit: 0
    } as AgentSearchDto);
  }
}
