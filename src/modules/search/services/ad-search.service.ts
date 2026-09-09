import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { AdSearchDto, AdAutocompleteDto, AdSortBy } from '../dto/ad-search.dto';

/**
 * Autocomplete suggestion item
 */
interface AutocompleteSuggestion {
  text: string;
  type: 'location' | 'category' | 'feature';
  filter: Record<string, string>;
  count: number;
  subtext?: string;
}

@Injectable()
export class AdSearchService {
  private readonly logger = new Logger(AdSearchService.name);
  private readonly indexName: string;

  constructor(private readonly elasticsearchService: ElasticsearchService) {
    this.indexName = this.elasticsearchService.getIndexName('ads');
  }

  /**
   * Smart Autocomplete for Ads
   * UPDATED: District priority and category name search
   */
  async autocomplete(dto: AdAutocompleteDto): Promise<{
    statusCode: number;
    data: AutocompleteSuggestion[];
    message: string;
    timestamp: string;
  }> {
    if (!this.elasticsearchService.isAvailable() || !dto.q || dto.q.length < 2) {
      return {
        statusCode: 200,
        data: [],
        message: 'Data retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    }

    const query = dto.q.trim().toLowerCase();
    const suggestions: AutocompleteSuggestion[] = [];

    try {
      const baseFilter: any[] = [
        { term: { approval_status: 'APPROVED' } },
        { term: { is_published: true } },
        { term: { is_active: true } },
      ];

      if (dto.category_id) {
        baseFilter.push({ term: { category_id: dto.category_id } });
      }

      // NEW: Filter by category_name if provided
      if (dto.category_name) {
        baseFilter.push({ term: { 'category.name.keyword': dto.category_name } });
      }

      // Search locations - DISTRICTS FIRST
      const locationSuggestions = await this.searchLocations(query, baseFilter, dto.limit || 10);
      suggestions.push(...locationSuggestions);

      // Search categories
      const categorySuggestions = await this.searchCategories(query, baseFilter);
      suggestions.push(...categorySuggestions);

      // Sort: Districts first, then by count
      const sortedSuggestions = this.sortSuggestions(suggestions)
        .slice(0, dto.limit || 10);

      return {
        statusCode: 200,
        data: sortedSuggestions,
        message: 'Data retrieved successfully',
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Ad autocomplete failed', error.message);
      return {
        statusCode: 200,
        data: [],
        message: 'Autocomplete temporarily unavailable',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Sort suggestions with district priority
   */
  private sortSuggestions(suggestions: AutocompleteSuggestion[]): AutocompleteSuggestion[] {
    return suggestions.sort((a, b) => {
      // Districts (subtext 'Area') get highest priority
      const aIsDistrict = a.type === 'location' && a.subtext === 'Area';
      const bIsDistrict = b.type === 'location' && b.subtext === 'Area';

      if (aIsDistrict && !bIsDistrict) return -1;
      if (!aIsDistrict && bIsDistrict) return 1;

      // Categories next
      if (a.type === 'category' && b.type !== 'category') return -1;
      if (a.type !== 'category' && b.type === 'category') return 1;

      // Finally by count
      return b.count - a.count;
    });
  }

  /**
   * Search locations with fuzzy matching
   * UPDATED: District priority with higher boost
   */
  private async searchLocations(
    query: string,
    baseFilter: any[],
    limit: number,
  ): Promise<AutocompleteSuggestion[]> {
    const suggestions: AutocompleteSuggestion[] = [];

    try {
      const searchBody = {
        size: 0,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    // DISTRICT - Higher boost for priority
                    {
                      match: {
                        'district.autocomplete': {
                          query,
                          fuzziness: 'AUTO',
                          prefix_length: 1,
                          boost: 3,
                        },
                      },
                    },
                    {
                      fuzzy: {
                        'district.keyword': {
                          value: query,
                          fuzziness: 'AUTO',
                          boost: 2,
                        },
                      },
                    },
                    // City
                    {
                      match: {
                        'city.autocomplete': {
                          query,
                          fuzziness: 'AUTO',
                          prefix_length: 1,
                        },
                      },
                    },
                    {
                      fuzzy: {
                        'city.keyword': {
                          value: query,
                          fuzziness: 'AUTO',
                        },
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
            filter: baseFilter,
          },
        },
        aggs: {
          // DISTRICTS FIRST
          districts: {
            terms: {
              field: 'district.keyword',
              size: limit,
              order: { _count: 'desc' },
            },
            aggs: {
              city: {
                terms: {
                  field: 'city.keyword',
                  size: 1,
                },
              },
              state: {
                terms: {
                  field: 'state.keyword',
                  size: 1,
                },
              },
            },
          },
          cities: {
            terms: {
              field: 'city.keyword',
              size: limit,
              order: { _count: 'desc' },
            },
            aggs: {
              state: {
                terms: {
                  field: 'state.keyword',
                  size: 1,
                },
              },
            },
          },
        },
      };

      const result = await this.elasticsearchService.search(this.indexName, searchBody);
      const aggs = result.aggregations;

      // Process DISTRICTS FIRST (Priority)
      const districtBuckets = aggs?.districts?.buckets || [];
      for (const bucket of districtBuckets) {
        const districtName = bucket.key;
        const cityName = bucket.city?.buckets?.[0]?.key || '';

        if (this.fuzzyMatch(query, districtName)) {
          suggestions.push({
            text: cityName ? `${districtName}, ${cityName}` : districtName,
            type: 'location',
            filter: { district: districtName },
            count: bucket.doc_count,
            subtext: 'Area',
          });
        }
      }

      // Process cities
      const cityBuckets = aggs?.cities?.buckets || [];
      for (const bucket of cityBuckets) {
        const cityName = bucket.key;
        const stateName = bucket.state?.buckets?.[0]?.key || '';

        if (this.fuzzyMatch(query, cityName)) {
          suggestions.push({
            text: stateName ? `${cityName}, ${stateName}` : cityName,
            type: 'location',
            filter: { city: cityName },
            count: bucket.doc_count,
            subtext: 'City',
          });
        }
      }

    } catch (error) {
      this.logger.error('Ad location search failed', error.message);
    }

    return suggestions;
  }

  /**
   * Search categories
   * UPDATED: Search by category.name and return both ID and name in filter
   */
  private async searchCategories(
    query: string,
    baseFilter: any[],
  ): Promise<AutocompleteSuggestion[]> {
    const suggestions: AutocompleteSuggestion[] = [];

    try {
      const searchBody = {
        size: 0,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    {
                      match: {
                        'category.name.autocomplete': {
                          query,
                          fuzziness: 'AUTO',
                          prefix_length: 1,
                        },
                      },
                    },
                    {
                      match: {
                        'category.name': {
                          query,
                          fuzziness: 'AUTO',
                        },
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
            filter: baseFilter,
          },
        },
        aggs: {
          categories: {
            terms: {
              field: 'category.name.keyword',
              size: 10,
              order: { _count: 'desc' },
            },
            aggs: {
              category_id: {
                terms: {
                  field: 'category.id',
                  size: 1,
                },
              },
              parent_name: {
                terms: {
                  field: 'category.parent_name.keyword',
                  size: 1,
                },
              },
            },
          },
        },
      };

      const result = await this.elasticsearchService.search(this.indexName, searchBody);
      const categoryBuckets = result.aggregations?.categories?.buckets || [];

      for (const bucket of categoryBuckets) {
        const categoryName = bucket.key;
        const categoryId = bucket.category_id?.buckets?.[0]?.key || '';
        const parentName = bucket.parent_name?.buckets?.[0]?.key || '';

        if (categoryName && this.fuzzyMatch(query, categoryName) && bucket.doc_count > 0) {
          suggestions.push({
            text: categoryName,
            type: 'category',
            filter: {
              category_id: categoryId,
              category_name: categoryName,
            },
            count: bucket.doc_count,
            subtext: parentName || 'Category',
          });
        }
      }

    } catch (error) {
      this.logger.error('Category search failed', error.message);
    }

    return suggestions;
  }

  /**
   * Simple fuzzy match check
   */
  private fuzzyMatch(query: string, target: string): boolean {
    const q = query.toLowerCase();
    const t = target.toLowerCase();

    if (t.includes(q) || q.includes(t)) return true;
    if (t.startsWith(q.substring(0, 2))) return true;

    if (q.length <= 4) {
      let matches = 0;
      for (let i = 0; i < q.length; i++) {
        if (t.includes(q[i])) matches++;
      }
      return matches >= q.length * 0.7;
    }

    return false;
  }

  /**
   * Search ads
   * UPDATED: Added category_name filter and category object in response
   */
  async search(dto: AdSearchDto): Promise<{
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
        // Filter out very low relevance results when using text search
        ...(dto.q && { min_score: 0.5 }),
      };

      if (dto.include_filters) {
        searchBody.aggs = this.buildAggregations();
      }

      const result = await this.elasticsearchService.search(this.indexName, searchBody);

      // UPDATED: Transform includes category object
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
      this.logger.error('Ad search failed', error.message);
      return this.emptyResponse(page, limit, 'Search temporarily unavailable');
    }
  }

  /**
   * Build Elasticsearch query with synonym support
   * UPDATED: District priority and category_name filter
   */
  private buildQuery(dto: AdSearchDto): any {
    const must: any[] = [];
    const filter: any[] = [];

    // Default filters
    filter.push({ term: { approval_status: 'APPROVED' } });
    filter.push({ term: { is_published: true } });
    filter.push({ term: { is_active: true } });

    // Text search with DISTRICT and CATEGORY priority
    if (dto.q) {
      must.push({
        bool: {
          should: [
            // HIGHEST PRIORITY: District and Category Name
            {
              multi_match: {
                query: dto.q,
                fields: [
                  'district^6',                    // District - Highest
                  'district.keyword^6',
                  'district.autocomplete^5',
                  'category.name^5',               // Category name
                  'category.name.keyword^5',
                  'category.name.autocomplete^4',
                  'city^4',
                  'city.keyword^4',
                  'title^3',
                  'state^2',
                ],
                type: 'best_fields',
                fuzziness: 'AUTO',
                prefix_length: 1,
                minimum_should_match: '75%',
              },
            },
            // Medium boost: Autocomplete fields
            {
              multi_match: {
                query: dto.q,
                fields: [
                  'title.autocomplete^2',
                  'city.autocomplete^2',
                  'district.autocomplete^3',
                  'category.name.autocomplete^3',
                ],
                type: 'best_fields',
                fuzziness: 'AUTO',
                minimum_should_match: '75%',
              },
            },
            // Lower boost: Description
            {
              multi_match: {
                query: dto.q,
                fields: [
                  'description',
                  'address_line',
                ],
                type: 'best_fields',
                fuzziness: 'AUTO',
                minimum_should_match: '50%',
                boost: 0.5,
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    // Basic filters
    if (dto.status) {
      filter.push({ term: { status: dto.status } });
    }

    // ============================================
    // CATEGORY FILTERS - Support both ID and Name
    // ============================================
    if (dto.category_id) {
      filter.push({ term: { category_id: dto.category_id } });
    }

    // NEW: Filter by category_name
    if (dto.category_name) {
      filter.push({ term: { 'category.name.keyword': dto.category_name } });
    }

    // Location filters - DISTRICT first
    if (dto.district) {
      filter.push({ term: { 'district.keyword': dto.district } });
    }

    if (dto.city) {
      filter.push({ term: { 'city.keyword': dto.city } });
    }

    if (dto.state) {
      filter.push({ term: { 'state.keyword': dto.state } });
    }

    if (dto.postal_code) {
      filter.push({ term: { postal_code: dto.postal_code } });
    }

    // Price range
    if (dto.price_min !== undefined || dto.price_max !== undefined) {
      const range: any = {};
      if (dto.price_min !== undefined) range.gte = dto.price_min;
      if (dto.price_max !== undefined) range.lte = dto.price_max;
      filter.push({ range: { price: range } });
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

    // Boolean flags
    if (dto.is_verified !== undefined) {
      filter.push({ term: { is_verified: dto.is_verified } });
    }

    if (dto.is_premium !== undefined) {
      filter.push({ term: { is_premium: dto.is_premium } });
    }

    if (dto.is_featured !== undefined) {
      filter.push({ term: { is_featured: dto.is_featured } });
    }

    if (dto.is_negotiable !== undefined) {
      filter.push({ term: { is_negotiable: dto.is_negotiable } });
    }

    // Owner
    if (dto.owner_id) {
      filter.push({ term: { owner_id: dto.owner_id } });
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
  private buildSort(sortBy?: AdSortBy, hasTextQuery?: boolean): any[] {
    const prioritySort = [
      { is_boosted: { order: 'desc' as const, missing: '_last' } },
      { boost_priority: { order: 'desc' as const, missing: '_last' } },
      { is_top_listing: { order: 'desc' as const, missing: '_last' } },
      { is_featured: { order: 'desc' as const, missing: '_last' } },
      { is_premium: { order: 'desc' as const, missing: '_last' } },
    ];

    let userSort: any[];
    switch (sortBy) {
      case AdSortBy.PRICE_LOW:
        userSort = [{ price: { order: 'asc' as const } }];
        break;
      case AdSortBy.PRICE_HIGH:
        userSort = [{ price: { order: 'desc' as const } }];
        break;
      case AdSortBy.OLDEST:
        userSort = [{ created_at: { order: 'asc' as const } }];
        break;
      case AdSortBy.POPULAR:
        userSort = [
          { view_count: { order: 'desc' as const } },
          { favorite_count: { order: 'desc' as const } },
        ];
        break;
      case AdSortBy.RELEVANCE:
        userSort = hasTextQuery ? [{ _score: { order: 'desc' as const } }] : [];
        break;
      case AdSortBy.NEWEST:
      default:
        userSort = [{ created_at: { order: 'desc' as const } }];
    }

    return [...prioritySort, ...userSort, { created_at: { order: 'desc' as const } }];
  }

  /**
   * Build aggregations
   * UPDATED: Added categories by name
   */
  private buildAggregations(): any {
    return {
      statuses: {
        terms: { field: 'status', size: 10 },
      },
      // Districts first
      districts: {
        terms: { field: 'district.keyword', size: 100 },
      },
      cities: {
        terms: { field: 'city.keyword', size: 100 },
      },
      states: {
        terms: { field: 'state.keyword', size: 50 },
      },
      // Categories by name with ID
      categories: {
        terms: { field: 'category.name.keyword', size: 50 },
        aggs: {
          category_id: {
            terms: { field: 'category.id', size: 1 },
          },
        },
      },
      price_stats: {
        stats: { field: 'price' },
      },
    };
  }

  /**
   * Transform to API format
   * UPDATED: Includes category object
   */
  private transformToApiFormat(hit: { _id: string; _score: number; _source: any }): any {
    const source = hit._source;

    return {
      id: source.id,
      title: source.title,
      description: source.description,

      // CATEGORY - Both ID and full object
      category_id: source.category_id,
      category: source.category ? {
        id: source.category.id,
        name: source.category.name,
        code: source.category.code || null,
        parent_id: source.category.parent_id || null,
        parent_name: source.category.parent_name || null,
        icon: source.category.icon || null,
      } : null,

      price: source.price?.toString() || '0',
      price_unit: source.price_unit || null,
      is_negotiable: source.is_negotiable || false,
      status: source.status,
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
      contact_name: source.contact_name,
      contact_phone: source.contact_phone,
      contact_email: source.contact_email,
      owner_id: source.owner_id,
      is_boosted: source.is_boosted || false,
      active_boost_type: source.active_boost_type || null,
      boost_expires_at: source.boost_expires_at || null,
      boost_priority: source.boost_priority || 0,
      is_top_listing: source.is_top_listing || false,
      top_listing_expires_at: source.top_listing_expires_at || null,
      approval_status: source.approval_status,
      is_published: source.is_published,
      is_verified: source.is_verified || false,
      is_premium: source.is_premium || false,
      is_featured: source.is_featured || false,
      is_active: source.is_active,
      slug: source.slug || null,
      meta_description: source.meta_description || null,
      meta_keywords: source.meta_keywords || null,
      view_count: source.view_count || 0,
      favorite_count: source.favorite_count || 0,
      contact_count: source.contact_count || 0,
      click_count: source.click_count || 0,
      expires_at: source.expires_at || null,
      created_at: source.created_at,
      updated_at: source.updated_at,
      published_at: source.published_at || null,
      approved_at: source.approved_at || null,
      images: source.images || [],
      _score: hit._score,
    };
  }

  /**
   * Transform aggregations
   * UPDATED: Categories include ID
   */
  private transformAggregations(aggs: any): any {
    const transformBuckets = (buckets: any[]) =>
      buckets?.map(b => ({
        value: b.key,
        label: b.key,
        count: b.doc_count,
      })) || [];

    // Transform category buckets with ID
    const transformCategoryBuckets = (buckets: any[]) =>
      buckets?.map(b => ({
        value: b.category_id?.buckets?.[0]?.key || b.key,
        label: b.key,
        name: b.key,
        id: b.category_id?.buckets?.[0]?.key || null,
        count: b.doc_count,
      })) || [];

    return {
      statuses: transformBuckets(aggs.statuses?.buckets),
      districts: transformBuckets(aggs.districts?.buckets),
      cities: transformBuckets(aggs.cities?.buckets),
      states: transformBuckets(aggs.states?.buckets),
      categories: transformCategoryBuckets(aggs.categories?.buckets),
      price: aggs.price_stats ? {
        min: aggs.price_stats.min || 0,
        max: aggs.price_stats.max || 0,
        avg: Math.round(aggs.price_stats.avg || 0),
      } : null,
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