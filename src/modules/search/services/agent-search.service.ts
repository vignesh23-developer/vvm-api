import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { AgentSearchDto, AgentAutocompleteDto, AgentSortBy } from '../dto/agent-search.dto';

/**
 * Agent Search Service
 */
@Injectable()
export class AgentSearchService {
  private readonly logger = new Logger(AgentSearchService.name);
  private readonly indexName: string;

  constructor(private readonly elasticsearchService: ElasticsearchService) {
    this.indexName = this.elasticsearchService.getIndexName('agents');
  }

  /**
   * Search agents
   */
  async search(dto: AgentSearchDto): Promise<{
    statusCode: number;
    data: {
      data: any[];
      total: number;
      page: number;
      limit: number;
      filters?: any;
    };
    message: string;
    timestamp: string;
  }> {
    const { page = 1, limit = 10 } = dto;

    if (!this.elasticsearchService.isAvailable()) {
      this.logger.warn('Elasticsearch not available');
      return this.emptyResponse(page, limit);
    }

    try {
      const from = (page - 1) * limit;

      const searchBody: any = {
        from,
        size: limit,
        query: this.buildQuery(dto),
        sort: this.buildSort(dto.sort, !!dto.q),
        track_total_hits: true,
      };

      if (dto.include_filters) {
        searchBody.aggs = this.buildAggregations();
      }

      const result = await this.elasticsearchService.search(this.indexName, searchBody);

      const data = result.hits.map(hit => this.transformToApiFormat(hit));

      const filters = dto.include_filters && result.aggregations
        ? this.transformAggregations(result.aggregations)
        : undefined;

      return {
        statusCode: 200,
        data: {
          data,
          total: result.total,
          page,
          limit,
          ...(filters && { filters }),
        },
        message: 'Data retrieved successfully',
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Agent search failed', error.message);
      return this.emptyResponse(page, limit, 'Search temporarily unavailable');
    }
  }

  /**
   * Autocomplete for agent/company names
   */
  async autocomplete(dto: AgentAutocompleteDto): Promise<{
    statusCode: number;
    data: any[];
    message: string;
    timestamp: string;
  }> {
    if (!this.elasticsearchService.isAvailable() || !dto.q) {
      return {
        statusCode: 200,
        data: [],
        message: 'Data retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const filter: any[] = [
        { term: { is_active: true } },
        { term: { is_deactivated: false } },
      ];

      if (dto.city) {
        filter.push({ term: { 'city.keyword': dto.city } });
      }

      const searchBody = {
        size: dto.limit || 10,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: dto.q,
                  fields: [
                    'company_name.autocomplete^3',
                    'profile_name.autocomplete^2',
                    'contact_name',
                  ],
                  type: 'bool_prefix',
                },
              },
            ],
            filter,
          },
        },
        _source: ['id', 'profile_name', 'company_name', 'city', 'company_logo', 'is_verified'],
      };

      const result = await this.elasticsearchService.search(this.indexName, searchBody);

      const suggestions = result.hits.map(hit => ({
        id: hit._source.id,
        profile_name: hit._source.profile_name,
        company_name: hit._source.company_name,
        city: hit._source.city,
        company_logo: hit._source.company_logo,
        is_verified: hit._source.is_verified,
      }));

      return {
        statusCode: 200,
        data: suggestions,
        message: 'Data retrieved successfully',
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Agent autocomplete failed', error.message);
      return {
        statusCode: 200,
        data: [],
        message: 'Autocomplete temporarily unavailable',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Build Elasticsearch query
   */
  private buildQuery(dto: AgentSearchDto): any {
    const must: any[] = [];
    const filter: any[] = [];

    // Default filters - only active, non-deactivated agents
    filter.push({ term: { is_active: true } });
    filter.push({ term: { is_deactivated: false } });

    // Text search
    if (dto.q) {
      must.push({
        multi_match: {
          query: dto.q,
          fields: [
            'company_name^3',
            'profile_name^2',
            'contact_name',
            'description',
            'city^2',
          ],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Location filters
    if (dto.city) {
      filter.push({ term: { 'city.keyword': dto.city } });
    }

    if (dto.district) {
      filter.push({ term: { 'district.keyword': dto.district } });
    }

    if (dto.state) {
      filter.push({ term: { 'state.keyword': dto.state } });
    }

    // Geo filter
    if (dto.lat !== undefined && dto.lon !== undefined) {
      filter.push({
        geo_distance: {
          distance: dto.radius || '10km',
          location: { lat: dto.lat, lon: dto.lon },
        },
      });
    }

    // Verified filter
    if (dto.is_verified !== undefined) {
      filter.push({ term: { is_verified: dto.is_verified } });
    }

    // User filter
    if (dto.user_id) {
      filter.push({ term: { user_id: dto.user_id } });
    }

    return {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    };
  }

  /**
   * Build sort clause
   */
  private buildSort(sortBy?: AgentSortBy, hasTextQuery?: boolean): any[] {
    // Verified agents first
    const prioritySort = [
      { is_verified: { order: 'desc' as const, missing: '_last' } },
    ];

    let userSort: any[];
    switch (sortBy) {
      case AgentSortBy.NAME_ASC:
        userSort = [{ 'company_name.keyword': { order: 'asc' as const } }];
        break;
      case AgentSortBy.NAME_DESC:
        userSort = [{ 'company_name.keyword': { order: 'desc' as const } }];
        break;
      case AgentSortBy.OLDEST:
        userSort = [{ created_at: { order: 'asc' as const } }];
        break;
      case AgentSortBy.RELEVANCE:
        userSort = hasTextQuery ? [{ _score: { order: 'desc' as const } }] : [];
        break;
      case AgentSortBy.NEWEST:
      default:
        userSort = [{ created_at: { order: 'desc' as const } }];
    }

    return [...prioritySort, ...userSort, { created_at: { order: 'desc' as const } }];
  }

  /**
   * Build aggregations
   */
  private buildAggregations(): any {
    return {
      cities: {
        terms: { field: 'city.keyword', size: 100 },
      },
      districts: {
        terms: { field: 'district.keyword', size: 100 },
      },
      states: {
        terms: { field: 'state.keyword', size: 50 },
      },
      verified_count: {
        filter: { term: { is_verified: true } },
      },
    };
  }

  /**
   * Transform to API format
   */
  private transformToApiFormat(hit: { _id: string; _score: number; _source: any }): any {
    const source = hit._source;

    return {
      id: source.id,
      profileName: source.profile_name,
      companyName: source.company_name,
      shortTitle: source.short_title || null,
      description: source.description,
      companyLogo: source.company_logo || null,
      gstNumber: source.gst_number || null,
      contact_name: source.contact_name,
      contact_phone: source.contact_phone,
      contact_email: source.contact_email,
      userId: source.user_id,
      door_number: source.door_number,
      street_name: source.street_name,
      address_line: source.address_line,
      city: source.city,
      district: source.district,
      state: source.state,
      postal_code: source.postal_code,
      country: source.country,
      latitude: source.location?.lat?.toString() || null,
      longitude: source.location?.lon?.toString() || null,
      isDeactivated: source.is_deactivated || false,
      isActive: source.is_active,
      isVerified: source.is_verified || false,
      expiryDate: source.expiry_date || null,
      createdAt: source.created_at,
      updatedAt: source.updated_at,
      _score: hit._score,
    };
  }

  /**
   * Transform aggregations
   */
  private transformAggregations(aggs: any): any {
    const transformBuckets = (buckets: any[]) =>
      buckets?.map(b => ({
        value: b.key,
        label: b.key,
        count: b.doc_count,
      })) || [];

    return {
      cities: transformBuckets(aggs.cities?.buckets),
      districts: transformBuckets(aggs.districts?.buckets),
      states: transformBuckets(aggs.states?.buckets),
      verified_count: aggs.verified_count?.doc_count || 0,
    };
  }

  /**
   * Empty response helper
   */
  private emptyResponse(page: number, limit: number, message = 'No results found'): any {
    return {
      statusCode: 200,
      data: { data: [], total: 0, page, limit },
      message,
      timestamp: new Date().toISOString(),
    };
  }
}