import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import {
  PropertySearchDto,
  PropertyAutocompleteDto,
  SortBy,
  parseCommaSeparated,
} from '../dto/property-search.dto';

interface AutocompleteSuggestion {
  text: string;
  type: 'location' | 'bhk' | 'property_type' | 'amenity' | 'feature' | 'category';
  filter: Record<string, string>;
  count: number;
  subtext?: string;
}

const BHK_PATTERNS = [
  { pattern: /^1\s*bhk|^1\s*bedroom|^one\s*bhk|^single\s*bedroom/i, value: '1 BHK', filter: '1' },
  { pattern: /^2\s*bhk|^2\s*bedroom|^two\s*bhk|^double\s*bedroom/i, value: '2 BHK', filter: '2' },
  { pattern: /^3\s*bhk|^3\s*bedroom|^three\s*bhk|^triple\s*bedroom/i, value: '3 BHK', filter: '3' },
  { pattern: /^4\s*bhk|^4\s*bedroom|^four\s*bhk/i, value: '4 BHK', filter: '4' },
  { pattern: /^5\s*bhk|^5\s*bedroom|^five\s*bhk/i, value: '5 BHK', filter: '5' },
  { pattern: /^6\s*bhk|^6\s*bedroom|^six\s*bhk/i, value: '6 BHK', filter: '6' },
];

const PROPERTY_TYPE_PATTERNS = [
  { pattern: /flat|apartment|apt/i, value: 'Apartment', type: 'Apartment' },
  { pattern: /villa|independent\s*house|bungalow/i, value: 'Villa', type: 'Villa' },
  { pattern: /plot|land|site/i, value: 'Plot', type: 'Plot' },
  { pattern: /penthouse/i, value: 'Penthouse', type: 'Penthouse' },
  { pattern: /duplex/i, value: 'Duplex', type: 'Duplex' },
  { pattern: /studio|1\s*rk/i, value: 'Studio', type: 'Studio' },
  { pattern: /commercial|shop|office|showroom/i, value: 'Commercial', type: 'Commercial' },
  { pattern: /warehouse|godown/i, value: 'Warehouse', type: 'Warehouse' },
];

const AMENITY_PATTERNS = [
  { pattern: /parking|car\s*park/i, value: 'Car Parking' },
  { pattern: /gym|gymnasium|fitness/i, value: 'Gym' },
  { pattern: /pool|swimming/i, value: 'Swimming Pool' },
  { pattern: /lift|elevator/i, value: 'Lift' },
  { pattern: /security|gated/i, value: 'Security' },
  { pattern: /power\s*backup|generator/i, value: 'Power Backup' },
  { pattern: /club\s*house/i, value: 'Club House' },
  { pattern: /park|garden|playground/i, value: 'Park' },
  { pattern: /cctv|camera/i, value: 'CCTV' },
];

@Injectable()
export class PropertySearchService {
  private readonly logger = new Logger(PropertySearchService.name);
  private readonly indexName: string;

  constructor(private readonly elasticsearchService: ElasticsearchService) {
    this.indexName = this.elasticsearchService.getIndexName('properties');
  }

  async autocomplete(dto: PropertyAutocompleteDto): Promise<{
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
      // Base filters for all queries
      const baseFilter: any[] = [
        { term: { approval_status: 'APPROVED' } },
        { term: { is_published: true } },
        { term: { is_active: true } },
      ];

      if (dto.listing_type) {
        baseFilter.push({ term: { listing_type: dto.listing_type } });
      }

      // 1. Check if query matches BHK pattern
      const bhkMatch = this.detectBHK(query);
      if (bhkMatch) {
        const count = await this.getCountForFilter(baseFilter, 'features.BHK.keyword', bhkMatch.filter);
        if (count > 0) {
          suggestions.push({
            text: bhkMatch.value,
            type: 'bhk',
            filter: { bhk: bhkMatch.filter },
            count,
          });
        }
      }

      // 2. Check if query matches property type/category pattern
      const propertyTypeMatch = this.detectPropertyType(query);
      if (propertyTypeMatch) {
        // Search for matching categories in ES
        const categoryCount = await this.getCategoryCount(baseFilter, propertyTypeMatch.value);
        if (categoryCount > 0) {
          suggestions.push({
            text: propertyTypeMatch.value,
            type: 'category',
            filter: { property_category_name: propertyTypeMatch.value },
            count: categoryCount,
            subtext: 'Property Type',
          });
        }
      }

      // 3. Check if query matches amenity
      const amenityMatch = this.detectAmenity(query);
      if (amenityMatch) {
        const count = await this.getCountForFilter(baseFilter, 'features.Amenities.keyword', amenityMatch);
        if (count > 0) {
          suggestions.push({
            text: amenityMatch,
            type: 'amenity',
            filter: { amenities: amenityMatch },
            count,
          });
        }
      }

      // 4. Search locations - DISTRICTS FIRST (Priority)
      const locationSuggestions = await this.searchLocations(query, baseFilter, dto.limit || 10);
      suggestions.push(...locationSuggestions);

      // 5. Search categories from ES (if no pattern match)
      if (!propertyTypeMatch) {
        const categorySuggestions = await this.searchCategories(query, baseFilter, 5);
        suggestions.push(...categorySuggestions);
      }

      // 6. If few results, also do a general text search for features
      if (suggestions.length < 3) {
        const textSuggestions = await this.searchByText(query, baseFilter, 3);
        suggestions.push(...textSuggestions);
      }

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
      this.logger.error('Autocomplete failed', error instanceof Error ? error.message : String(error));
      return {
        statusCode: 200,
        data: [],
        message: 'Autocomplete temporarily unavailable',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private sortSuggestions(suggestions: AutocompleteSuggestion[]): AutocompleteSuggestion[] {
    // Priority order: district > category > city > bhk > amenity > feature
    const typePriority: Record<string, number> = {
      'location': 1,  // Districts will have subtext 'Area'
      'category': 2,
      'bhk': 3,
      'amenity': 4,
      'feature': 5,
      'property_type': 6,
    };

    return suggestions.sort((a, b) => {
      // Districts (subtext 'Area') get highest priority
      const aIsDistrict = a.type === 'location' && a.subtext === 'Area';
      const bIsDistrict = b.type === 'location' && b.subtext === 'Area';

      if (aIsDistrict && !bIsDistrict) return -1;
      if (!aIsDistrict && bIsDistrict) return 1;

      // Then by type priority
      const aPriority = typePriority[a.type] || 10;
      const bPriority = typePriority[b.type] || 10;
      if (aPriority !== bPriority) return aPriority - bPriority;

      // Finally by count
      return b.count - a.count;
    });
  }

  private async getCategoryCount(baseFilter: any[], categoryName: string): Promise<number> {
    try {
      const count = await this.elasticsearchService.getCount(this.indexName, {
        bool: {
          filter: [
            ...baseFilter,
            {
              bool: {
                should: [
                  { term: { 'property_category.name.keyword': categoryName } },
                  { match: { 'property_category.name': { query: categoryName, fuzziness: 'AUTO' } } },
                ],
                minimum_should_match: 1,
              }
            },
          ],
        },
      });
      return count;
    } catch {
      return 0;
    }
  }

  private async searchCategories(
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
                    {
                      match: {
                        'property_category.name.autocomplete': {
                          query,
                          fuzziness: 'AUTO',
                          prefix_length: 1,
                        },
                      },
                    },
                    {
                      match: {
                        'property_category.name': {
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
              field: 'property_category.name.keyword',
              size: limit,
              order: { _count: 'desc' },
            },
            aggs: {
              category_id: {
                terms: {
                  field: 'property_category.id',
                  size: 1,
                },
              },
              parent_name: {
                terms: {
                  field: 'property_category.parent_name.keyword',
                  size: 1,
                },
              },
            },
          },
        },
      };

      const result = await this.elasticsearchService.search(this.indexName, searchBody);
      const buckets = result.aggregations?.categories?.buckets || [];

      for (const bucket of buckets) {
        const categoryName = bucket.key;
        const categoryId = bucket.category_id?.buckets?.[0]?.key || '';
        const parentName = bucket.parent_name?.buckets?.[0]?.key || '';

        if (this.fuzzyMatch(query, categoryName) && bucket.doc_count > 0) {
          suggestions.push({
            text: categoryName,
            type: 'category',
            filter: {
              property_category_id: categoryId,
              property_category_name: categoryName,
            },
            count: bucket.doc_count,
            subtext: parentName || 'Property Type',
          });
        }
      }

    } catch (error) {
      this.logger.error('Category search failed', error instanceof Error ? error.message : String(error));
    }

    return suggestions;
  }

  private detectBHK(query: string): { value: string; filter: string } | null {
    for (const bhk of BHK_PATTERNS) {
      if (bhk.pattern.test(query)) {
        return { value: bhk.value, filter: bhk.filter };
      }
    }
    return null;
  }

  private detectPropertyType(query: string): { value: string; type: string } | null {
    for (const pt of PROPERTY_TYPE_PATTERNS) {
      if (pt.pattern.test(query)) {
        return { value: pt.value, type: pt.type };
      }
    }
    return null;
  }

  private detectAmenity(query: string): string | null {
    for (const amenity of AMENITY_PATTERNS) {
      if (amenity.pattern.test(query)) {
        return amenity.value;
      }
    }
    return null;
  }

  private async getCountForFilter(
    baseFilter: any[],
    field: string,
    value: string,
  ): Promise<number> {
    try {
      const count = await this.elasticsearchService.getCount(this.indexName, {
        bool: {
          filter: [
            ...baseFilter,
            { term: { [field]: value } },
          ],
        },
      });
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Search locations with DISTRICT PRIORITY
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
                    // City autocomplete
                    {
                      match: {
                        'city.autocomplete': {
                          query,
                          fuzziness: 'AUTO',
                          prefix_length: 1,
                        },
                      },
                    },
                    // State autocomplete
                    {
                      match: {
                        'state.autocomplete': {
                          query,
                          fuzziness: 'AUTO',
                          prefix_length: 1,
                        },
                      },
                    },
                    // Fuzzy match on keyword fields
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
          states: {
            terms: {
              field: 'state.keyword',
              size: limit,
              order: { _count: 'desc' },
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
        const stateName = bucket.state?.buckets?.[0]?.key || '';

        if (this.fuzzyMatch(query, districtName)) {
          suggestions.push({
            text: cityName ? `${districtName}, ${cityName}` : districtName,
            type: 'location',
            filter: { district: districtName },
            count: bucket.doc_count,
            subtext: 'Area',  // Mark as district
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

      // Process states
      const stateBuckets = aggs?.states?.buckets || [];
      for (const bucket of stateBuckets) {
        const stateName = bucket.key;

        if (this.fuzzyMatch(query, stateName)) {
          suggestions.push({
            text: stateName,
            type: 'location',
            filter: { state: stateName },
            count: bucket.doc_count,
            subtext: 'State',
          });
        }
      }

    } catch (error) {
      this.logger.error('Location search failed', error instanceof Error ? error.message : String(error));
    }

    return suggestions;
  }

  private async searchByText(
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
                multi_match: {
                  query,
                  fields: [
                    'features.BHK^3',
                    'features.BHK.autocomplete^2',
                    'features.Amenities^2',
                    'features.Amenities.autocomplete',
                    'features.Furnishing',
                    'features.Parking',
                  ],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: baseFilter,
          },
        },
        aggs: {
          bhk: {
            terms: {
              field: 'features.BHK.keyword',
              size: 5,
            },
          },
          amenities: {
            terms: {
              field: 'features.Amenities.keyword',
              size: 10,
            },
          },
          furnishing: {
            terms: {
              field: 'features.Furnishing.keyword',
              size: 5,
            },
          },
        },
      };

      const result = await this.elasticsearchService.search(this.indexName, searchBody);
      const aggs = result.aggregations;

      // BHK suggestions
      const bhkBuckets = aggs?.bhk?.buckets || [];
      for (const bucket of bhkBuckets) {
        if (this.fuzzyMatch(query, bucket.key) && bucket.doc_count > 0) {
          suggestions.push({
            text: bucket.key,
            type: 'bhk',
            filter: { bhk: bucket.key.replace(/\D/g, '') },
            count: bucket.doc_count,
          });
        }
      }

      // Amenity suggestions
      const amenityBuckets = aggs?.amenities?.buckets || [];
      for (const bucket of amenityBuckets) {
        if (this.fuzzyMatch(query, bucket.key) && bucket.doc_count > 0) {
          suggestions.push({
            text: bucket.key,
            type: 'amenity',
            filter: { amenities: bucket.key },
            count: bucket.doc_count,
          });
        }
      }

      // Furnishing suggestions
      const furnishingBuckets = aggs?.furnishing?.buckets || [];
      for (const bucket of furnishingBuckets) {
        if (this.fuzzyMatch(query, bucket.key) && bucket.doc_count > 0) {
          suggestions.push({
            text: bucket.key,
            type: 'feature',
            filter: { furnishing: bucket.key },
            count: bucket.doc_count,
          });
        }
      }

    } catch (error) {
      this.logger.error('Text search failed', error instanceof Error ? error.message : String(error));
    }

    return suggestions;
  }

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
   * Main Search
   * UPDATED: Added property_category_name filter and property_category in response
   */
  async search(dto: PropertySearchDto): Promise<{
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
      this.logger.warn('Elasticsearch not available. Returning empty results.');
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

      // UPDATED: Transform includes property_category object
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
      this.logger.error('Search failed', error instanceof Error ? error.message : String(error));
      return this.emptyResponse(page, limit, 'Search temporarily unavailable');
    }
  }

  async getFilterOptions(dto: Partial<PropertySearchDto>): Promise<any> {
    if (!this.elasticsearchService.isAvailable()) {
      return { filters: {} };
    }

    try {
      const searchBody = {
        size: 0,
        query: this.buildQuery({ ...dto, include_filters: false } as PropertySearchDto),
        aggs: this.buildAggregations(),
      };

      const result = await this.elasticsearchService.search(this.indexName, searchBody);

      return {
        statusCode: 200,
        data: {
          filters: this.transformAggregations(result.aggregations),
          total: result.total,
        },
        message: 'Filters retrieved successfully',
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Get filters failed', error instanceof Error ? error.message : String(error));
      return {
        statusCode: 200,
        data: { filters: {} },
        message: 'No filters available',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Build Query
   * UPDATED: Added property_category_name filter and improved district/category priority
   */
  private buildQuery(dto: PropertySearchDto): any {
    const must: any[] = [];
    const filter: any[] = [];

    // Default filters - only APPROVED, published, active properties
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
                  'district^6',                              // District - Highest
                  'district.keyword^6',
                  'district.autocomplete^5',
                  'property_category.name^5',                // Category name
                  'property_category.name.keyword^5',
                  'property_category.name.autocomplete^4',
                  'features.BHK^5',
                  'features.BHK.keyword^5',
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
                  'features.BHK.autocomplete^3',
                  'property_category.name.autocomplete^3',
                ],
                type: 'best_fields',
                fuzziness: 'AUTO',
                minimum_should_match: '75%',
              },
            },
            // Lower boost: Other fields
            {
              multi_match: {
                query: dto.q,
                fields: [
                  'features.Amenities',
                  'features.Furnishing',
                  'features.Parking',
                  'features.Facing',
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
    if (dto.listing_type) {
      filter.push({ term: { listing_type: dto.listing_type } });
    }

    if (dto.status) {
      filter.push({ term: { status: dto.status } });
    }

    if ((dto as any).project_status) {
      filter.push({ term: { project_status: (dto as any).project_status } });
    }

    // ============================================
    // CATEGORY FILTERS - Support both ID and Name
    // ============================================
    if (dto.property_category_id) {
      filter.push({ term: { property_category_id: dto.property_category_id } });
    }

    // NEW: Filter by property_category_name
    if (dto.property_category_name) {
      filter.push({
        term: { 'property_category.name.keyword': dto.property_category_name }
      });
    }

    // Location filters - DISTRICT first in order
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

    // Size range
    if (dto.size_min !== undefined || dto.size_max !== undefined) {
      const range: any = {};
      if (dto.size_min !== undefined) range.gte = dto.size_min;
      if (dto.size_max !== undefined) range.lte = dto.size_max;
      filter.push({ range: { property_size: range } });
    }

    // Layout price range (min/max) filter (layout-level)
    if ((dto as any).layout_price_min !== undefined || (dto as any).layout_price_max !== undefined) {
      const range: any = {};
      if ((dto as any).layout_price_min !== undefined) range.gte = (dto as any).layout_price_min;
      if ((dto as any).layout_price_max !== undefined) range.lte = (dto as any).layout_price_max;
      filter.push({ range: { layout_price_min: range } });
    }

    // Layout area range (sqft)
    if ((dto as any).layout_area_min_sqft !== undefined || (dto as any).layout_area_max_sqft !== undefined) {
      const range: any = {};
      if ((dto as any).layout_area_min_sqft !== undefined) range.gte = (dto as any).layout_area_min_sqft;
      if ((dto as any).layout_area_max_sqft !== undefined) range.lte = (dto as any).layout_area_max_sqft;
      filter.push({ range: { layout_area_min_sqft: range } });
    }

    // Plot counts + layout total sqft filters (range)
    const numericRanges: Array<{ key: string; field: string }> = [
      { key: 'plot_total_count', field: 'plot_total_count' },
      { key: 'plot_sold_count', field: 'plot_sold_count' },
      { key: 'plot_booked_count', field: 'plot_booked_count' },
      { key: 'plot_available_count', field: 'plot_available_count' },
      { key: 'layout_total_sqft', field: 'layout_total_sqft' },
    ];
    for (const r of numericRanges) {
      const minKey = `${r.key}_min`;
      const maxKey = `${r.key}_max`;
      const minVal = (dto as any)[minKey];
      const maxVal = (dto as any)[maxKey];
      if (minVal !== undefined || maxVal !== undefined) {
        const range: any = {};
        if (minVal !== undefined) range.gte = minVal;
        if (maxVal !== undefined) range.lte = maxVal;
        filter.push({ range: { [r.field]: range } });
      }
    }

    // Dynamic feature filters
    const featureFilters: Record<string, string | undefined> = {
      'features.BHK.keyword': dto.bhk,
      'features.Bathrooms.keyword': dto.bathrooms,
      'features.Furnishing.keyword': dto.furnishing,
      'features.Facing.keyword': dto.facing,
      'features.Parking.keyword': dto.parking,
      'features.Amenities.keyword': dto.amenities,
    };

    for (const [field, value] of Object.entries(featureFilters)) {
      const values = parseCommaSeparated(value);
      if (values && values.length > 0) {
        filter.push({ terms: { [field]: values } });
      }
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

    if (dto.has_offer === true) {
      // Prefer has_offer flag; also match any document that has offer text
      // (covers indices that were not reindexed after has_offer was added)
      filter.push({
        bool: {
          should: [
            { term: { has_offer: true } },
            { wildcard: { 'offer.keyword': '?*' } },
            { exists: { field: 'offer' } },
          ],
          minimum_should_match: 1,
        },
      });
    }

    // Owner/Agent
    if (dto.owner_id) {
      filter.push({ term: { owner_id: dto.owner_id } });
    }

    if (dto.agent_id) {
      filter.push({ term: { agent_id: dto.agent_id } });
    }

    return {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    };
  }

  private buildSort(sortBy?: SortBy, hasTextQuery?: boolean): any[] {
    const prioritySort = [
      { is_boosted: { order: 'desc' as const, missing: '_last' } },
      { boost_priority: { order: 'desc' as const, missing: '_last' } },
      { is_top_listing: { order: 'desc' as const, missing: '_last' } },
      { is_featured: { order: 'desc' as const, missing: '_last' } },
      { is_premium: { order: 'desc' as const, missing: '_last' } },
    ];

    let userSort: any[];
    switch (sortBy) {
      case SortBy.PRICE_LOW:
        userSort = [{ price: { order: 'asc' as const } }];
        break;
      case SortBy.PRICE_HIGH:
        userSort = [{ price: { order: 'desc' as const } }];
        break;
      case SortBy.OLDEST:
        userSort = [{ created_at: { order: 'asc' as const } }];
        break;
      case SortBy.POPULAR:
        userSort = [
          { view_count: { order: 'desc' as const } },
          { favorite_count: { order: 'desc' as const } },
        ];
        break;
      case SortBy.SIZE_LOW:
        userSort = [{ property_size: { order: 'asc' as const, missing: '_last' } }];
        break;
      case SortBy.SIZE_HIGH:
        userSort = [{ property_size: { order: 'desc' as const, missing: '_last' } }];
        break;
      case SortBy.RELEVANCE:
        userSort = hasTextQuery ? [{ _score: { order: 'desc' as const } }] : [];
        break;
      case SortBy.NEWEST:
      default:
        userSort = [{ created_at: { order: 'desc' as const } }];
    }

    return [...prioritySort, ...userSort, { created_at: { order: 'desc' as const } }];
  }

  /**
   * Build Aggregations
   * UPDATED: Added property_categories aggregation
   */
  private buildAggregations(): any {
    return {
      listing_types: {
        terms: { field: 'listing_type', size: 10 },
      },
      statuses: {
        terms: { field: 'status', size: 10 },
      },
      project_statuses: {
        terms: { field: 'project_status', size: 10 },
      },
      // Location - Districts first
      districts: {
        terms: { field: 'district.keyword', size: 100 },
      },
      cities: {
        terms: { field: 'city.keyword', size: 100 },
      },
      states: {
        terms: { field: 'state.keyword', size: 50 },
      },
      // NEW: Property Categories
      property_categories: {
        terms: { field: 'property_category.name.keyword', size: 50 },
        aggs: {
          category_id: {
            terms: { field: 'property_category.id', size: 1 },
          },
        },
      },
      // Features
      bhk: {
        terms: { field: 'features.BHK.keyword', size: 10 },
      },
      bathrooms: {
        terms: { field: 'features.Bathrooms.keyword', size: 10 },
      },
      furnishing: {
        terms: { field: 'features.Furnishing.keyword', size: 10 },
      },
      parking: {
        terms: { field: 'features.Parking.keyword', size: 20 },
      },
      amenities: {
        terms: { field: 'features.Amenities.keyword', size: 50 },
      },
      price_stats: {
        stats: { field: 'price' },
      },
      size_stats: {
        stats: { field: 'property_size' },
      },
      layout_price_min_stats: {
        stats: { field: 'layout_price_min' },
      },
      layout_area_min_sqft_stats: {
        stats: { field: 'layout_area_min_sqft' },
      },
    };
  }

  /**
   * Transform ES hit to API format
   * UPDATED: Includes property_category object
   */
  private transformToApiFormat(hit: { _id: string; _score: number; _source: any }): any {
    const source = hit._source;

    return {
      id: source.id,
      title: source.title,
      description: source.description,

      // CATEGORY - Both ID and full object
      property_category_id: source.property_category_id,
      property_category: source.property_category ? {
        id: source.property_category.id,
        name: source.property_category.name,
        code: source.property_category.code || null,
        parent_id: source.property_category.parent_id || null,
        parent_name: source.property_category.parent_name || null,
        icon: source.property_category.icon || null,
      } : null,

      price: source.price?.toString() || '0',
      price_unit: source.price_unit || null,
      property_size: source.property_size?.toString() || null,
      property_size_unit: source.property_size_unit || 'Sqft',
      listing_type: source.listing_type,
      status: source.status,
      project_status: source.project_status || null,
      offer: source.offer || null,
      has_offer: source.has_offer || false,
      door_number: source.door_number,
      street_name: source.street_name,
      address_line: source.address_line,
      city: source.city,
      district: source.district,
      state: source.state,
      postal_code: source.postal_code,
      country: source.country,
      contact_name: source.contact_name,
      contact_phone: source.contact_phone,
      contact_email: source.contact_email,
      is_boosted: source.is_boosted || false,
      boost_expires_at: source.boost_expires_at || null,
      boost_priority: source.boost_priority || 0,
      is_top_listing: source.is_top_listing || false,
      top_listing_expires_at: source.top_listing_expires_at || null,
      latitude: source.location?.lat?.toString() || source.latitude,
      longitude: source.location?.lon?.toString() || source.longitude,
      owner_id: source.owner_id,
      agent_id: source.agent_id || null,
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
      created_at: source.created_at,
      updated_at: source.updated_at,
      published_at: source.published_at || null,
      approved_at: source.approved_at || null,
      media: source.media || [],
      features: source.features || {},
      // Layout fields
      layout_price_min: source.layout_price_min ?? null,
      layout_price_max: source.layout_price_max ?? null,
      layout_area_min_sqft: source.layout_area_min_sqft ?? null,
      layout_area_max_sqft: source.layout_area_max_sqft ?? null,
      layout_area_unit: source.layout_area_unit ?? null,
      plot_total_count: source.plot_total_count ?? null,
      plot_sold_count: source.plot_sold_count ?? null,
      plot_booked_count: source.plot_booked_count ?? null,
      plot_available_count: source.plot_available_count ?? null,
      layout_total_sqft: source.layout_total_sqft ?? null,
      _score: hit._score,
    };
  }

  /**
   * Transform Aggregations
   * UPDATED: Added property_categories with ID
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
      listing_types: transformBuckets(aggs.listing_types?.buckets),
      statuses: transformBuckets(aggs.statuses?.buckets),
      project_statuses: transformBuckets(aggs.project_statuses?.buckets),
      districts: transformBuckets(aggs.districts?.buckets),
      cities: transformBuckets(aggs.cities?.buckets),
      states: transformBuckets(aggs.states?.buckets),
      property_categories: transformCategoryBuckets(aggs.property_categories?.buckets),
      bhk: transformBuckets(aggs.bhk?.buckets),
      bathrooms: transformBuckets(aggs.bathrooms?.buckets),
      furnishing: transformBuckets(aggs.furnishing?.buckets),
      parking: transformBuckets(aggs.parking?.buckets),
      amenities: transformBuckets(aggs.amenities?.buckets),
      price: aggs.price_stats ? {
        min: aggs.price_stats.min || 0,
        max: aggs.price_stats.max || 0,
        avg: Math.round(aggs.price_stats.avg || 0),
      } : null,
      size: aggs.size_stats ? {
        min: aggs.size_stats.min || 0,
        max: aggs.size_stats.max || 0,
        avg: Math.round(aggs.size_stats.avg || 0),
      } : null,
      layout_price: aggs.layout_price_min_stats ? {
        min: aggs.layout_price_min_stats.min || 0,
        max: aggs.layout_price_min_stats.max || 0,
        avg: Math.round(aggs.layout_price_min_stats.avg || 0),
      } : null,
      layout_area_sqft: aggs.layout_area_min_sqft_stats ? {
        min: aggs.layout_area_min_sqft_stats.min || 0,
        max: aggs.layout_area_min_sqft_stats.max || 0,
        avg: Math.round(aggs.layout_area_min_sqft_stats.avg || 0),
      } : null,
    };
  }

  private emptyResponse(page: number, limit: number, message = 'No results found'): any {
    return {
      statusCode: 200,
      data: { data: [], total: 0, page, limit },
      message,
      timestamp: new Date().toISOString(),
    };
  }
}