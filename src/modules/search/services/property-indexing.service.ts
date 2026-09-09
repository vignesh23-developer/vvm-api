import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ElasticsearchService } from './elasticsearch.service';
import { Property } from '../../property/entities/properties.entity';
import { FeatureOption } from '../../master/entities/feature-option.entity';
import { PropertyCategory } from '../../master/entities/property-category.entity';

@Injectable()
export class PropertyIndexingService {
  private readonly logger = new Logger(PropertyIndexingService.name);
  private readonly indexName: string;
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(FeatureOption)
    private readonly featureOptionRepository: Repository<FeatureOption>,
    @InjectRepository(PropertyCategory)
    private readonly propertyCategoryRepository: Repository<PropertyCategory>,
  ) {
    this.indexName = this.elasticsearchService.getIndexName('properties');
  }

  /**
   * Index a single property by ID
   */
  async indexProperty(propertyId: string): Promise<void> {
    this.logger.log(`Indexing property: ${propertyId}`);

    const property = await this.fetchPropertyWithRelations(propertyId);

    if (!property) {
      this.logger.warn(`Property not found: ${propertyId}`);
      return;
    }

    const document = await this.transformToEsDocument(property);
    await this.elasticsearchService.indexDocument(this.indexName, propertyId, document);

    this.logger.log(`Property indexed: ${propertyId}`);
  }

  /**
   * Remove a property from ES index
   */
  async removeProperty(propertyId: string): Promise<void> {
    this.logger.log(`Removing property from index: ${propertyId}`);
    await this.elasticsearchService.deleteDocument(this.indexName, propertyId);
  }

  /**
   * Update property in ES (re-index)
   */
  async updateProperty(propertyId: string): Promise<void> {
    await this.indexProperty(propertyId);
  }

  /**
   * Bulk index all properties
   */
  async reindexAll(): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
    took: number;
  }> {
    this.logger.log('Starting full reindex of all properties');
    const startTime = Date.now();

    let indexed = 0;
    let failed = 0;

    try {
      // Get total count
      const total = await this.propertyRepository.count();
      this.logger.log(`Total properties to index: ${total}`);

      // Process in batches
      let offset = 0;
      while (offset < total) {
        const properties = await this.fetchPropertiesBatch(offset, this.BATCH_SIZE);

        if (properties.length === 0) break;

        // Transform to ES documents (async because we fetch feature options)
        const documents = await Promise.all(
          properties.map(p => this.transformToEsDocument(p))
        );

        // Bulk index
        const result = await this.elasticsearchService.bulkIndex(this.indexName, documents);

        indexed += result.success;
        failed += result.failed;

        if (result.errors.length > 0) {
          this.logger.warn(`Batch errors: ${result.errors.join(', ')}`);
        }

        this.logger.log(`Indexed batch ${offset + 1}-${offset + properties.length} of ${total}`);

        offset += this.BATCH_SIZE;
      }

      const took = Date.now() - startTime;
      this.logger.log(`Reindex completed: ${indexed} indexed, ${failed} failed, ${took}ms`);

      return { success: failed === 0, indexed, failed, took };

    } catch (error) {
      this.logger.error('Reindex failed', error.message);
      return {
        success: false,
        indexed,
        failed: failed + 1,
        took: Date.now() - startTime,
      };
    }
  }

  /**
   * Reindex specific properties by IDs
   */
  async reindexByIds(propertyIds: string[]): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
  }> {
    let indexed = 0;
    let failed = 0;

    for (const id of propertyIds) {
      try {
        await this.indexProperty(id);
        indexed++;
      } catch (error) {
        this.logger.error(`Failed to index property ${id}`, error.message);
        failed++;
      }
    }

    return { success: failed === 0, indexed, failed };
  }

  /**
   * Fetch property with all relations needed for indexing
   * UPDATED: Added property_category.parent relation
   */
  private async fetchPropertyWithRelations(propertyId: string): Promise<Property | null> {
    return this.propertyRepository.findOne({
      where: { id: propertyId },
      relations: [
        'property_category',
        'property_category.parent',  // NEW: Include parent category
        'feature_values',
        'feature_values.feature_category',
        'feature_values.feature_group',
        'media',
      ],
    });
  }

  /**
   * Fetch properties batch for reindexing
   * UPDATED: Added property_category.parent relation
   */
  private async fetchPropertiesBatch(offset: number, limit: number): Promise<Property[]> {
    return this.propertyRepository.find({
      relations: [
        'property_category',
        'property_category.parent',  // NEW: Include parent category
        'feature_values',
        'feature_values.feature_category',
        'feature_values.feature_group',
        'media',
      ],
      skip: offset,
      take: limit,
      order: { created_at: 'ASC' },
    });
  }

  /**
   * Transform Property entity to ES document
   *
   * UPDATED: Now includes property_category object with name, code, parent
   *
   * This is where the magic happens:
   * - Flatten feature_values to features object using feature_category.code as key
   * - Convert lat/lon to geo_point
   * - Include media array
   * - Include property_category object for category name search
   */
  async transformToEsDocument(property: Property): Promise<any> {
    // Build features object from feature_values
    const features = await this.buildFeaturesObject(property.feature_values || []);

    // Build media array (sorted by sort_order)
    const media = (property.media || [])
      .filter(m => m.media_type === 'IMAGE')
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(m => ({
        id: m.id,
        url: m.url,
        thumbnail_url: m.thumbnail_url,
        is_primary: m.is_primary || false,
        sort_order: m.sort_order,
        media_type: m.media_type,
      }));

    // ============================================
    // NEW: Build property_category object
    // ============================================
    const propertyCategory = await this.buildPropertyCategoryObject(property);

    return {
      id: property.id,
      title: property.title,
      description: property.description,
      property_category_id: property.property_category_id,

      // NEW: Full property_category object for search
      property_category: propertyCategory,

      price: parseFloat(property.price?.toString() || '0'),
      price_unit: property.price_unit,
      property_size: property.property_size ? parseFloat(property.property_size.toString()) : null,
      property_size_unit: property.property_size_unit || 'Sqft',

      listing_type: property.listing_type,
      status: property.status,
      project_status: (property as any).project_status || 'CURRENT',
      approval_status: property.approval_status,
      offer: property.offer?.trim() || null,
      has_offer: !!(property.offer && String(property.offer).trim()),

      // Layout Category — Additional Fields
      layout_price_min: (property as any).layout_price_min != null ? parseFloat((property as any).layout_price_min.toString()) : null,
      layout_price_max: (property as any).layout_price_max != null ? parseFloat((property as any).layout_price_max.toString()) : null,
      layout_area_min_sqft: (property as any).layout_area_min_sqft != null ? parseFloat((property as any).layout_area_min_sqft.toString()) : null,
      layout_area_max_sqft: (property as any).layout_area_max_sqft != null ? parseFloat((property as any).layout_area_max_sqft.toString()) : null,
      layout_area_unit: (property as any).layout_area_unit ?? null,
      plot_total_count: (property as any).plot_total_count ?? null,
      plot_sold_count: (property as any).plot_sold_count ?? null,
      plot_booked_count: (property as any).plot_booked_count ?? null,
      plot_available_count: (property as any).plot_available_count ?? null,
      layout_total_sqft: (property as any).layout_total_sqft != null ? parseFloat((property as any).layout_total_sqft.toString()) : null,

      door_number: property.door_number,
      street_name: property.street_name,
      address_line: property.address_line,
      city: property.city,
      district: property.district,
      state: property.state,
      postal_code: property.postal_code,
      country: property.country,

      // Geo point for location-based search
      location: property.latitude && property.longitude
        ? {
          lat: parseFloat(property.latitude.toString()),
          lon: parseFloat(property.longitude.toString()),
        }
        : null,

      contact_name: property.contact_name,
      contact_phone: property.contact_phone,
      contact_email: property.contact_email,

      owner_id: property.owner_id,
      agent_id: property.agent_id,

      // Boost/promotion fields
      is_boosted: property.is_boosted || false,
      boost_expires_at: property.boost_expires_at?.toISOString() || null,
      boost_priority: property.boost_priority || 0,
      is_top_listing: property.is_top_listing || false,
      top_listing_expires_at: property.top_listing_expires_at?.toISOString() || null,

      // Status flags
      is_published: property.is_published || false,
      is_verified: property.is_verified || false,
      is_premium: property.is_premium || false,
      is_featured: property.is_featured || false,
      is_active: property.is_active !== false,

      // SEO
      slug: property.slug,
      meta_description: property.meta_description,
      meta_keywords: property.meta_keywords,

      // Stats
      view_count: property.view_count || 0,
      favorite_count: property.favorite_count || 0,
      contact_count: property.contact_count || 0,

      // Timestamps
      created_at: property.created_at?.toISOString(),
      updated_at: property.updated_at?.toISOString(),
      published_at: property.published_at?.toISOString() || null,
      approved_at: property.approved_at?.toISOString() || null,

      // Dynamic features
      features,

      // Media
      media,
    };
  }

  /**
   * NEW: Build property_category object for ES document
   * Includes: id, name, code, description, parent_id, parent_name
   */
  private async buildPropertyCategoryObject(property: Property): Promise<any | null> {
    let category = property.property_category;

    // If category not loaded, fetch it
    if (!category && property.property_category_id) {
      category = await this.propertyCategoryRepository.findOne({
        where: { id: property.property_category_id },
        relations: ['parent'],
      }) as PropertyCategory;
    }

    if (!category) {
      return null;
    }

    // Fetch parent if not already loaded
    let parentName: string | null = null;
    if (category.parent) {
      parentName = category.parent.name;
    } else if (category.parent_id) {
      const parent = await this.propertyCategoryRepository.findOne({
        where: { id: category.parent_id },
      });
      parentName = parent?.name || null;
    }

    return {
      id: category.id,
      name: category.name,
      description: category.description || null,
      parent_id: category.parent_id || null,
      parent_name: parentName,
      icon: category.icon || null,
      sort_order: category.sort_order || 0,
    };
  }

  /**
   * Build features object from feature_values
   *
   * Uses feature_category.code as key
   * Handles text, numeric, single_select, and multi_select input types
   */
  private async buildFeaturesObject(featureValues: any[]): Promise<Record<string, any>> {
    const features: Record<string, any> = {};

    // Collect all feature option IDs to fetch in bulk
    const allOptionIds: string[] = [];
    for (const fv of featureValues) {
      if (fv.feature_option_ids?.length > 0) {
        allOptionIds.push(...fv.feature_option_ids);
      }
    }

    // Fetch all feature options in one query
    let optionsMap: Map<string, any> = new Map();
    if (allOptionIds.length > 0) {
      const options = await this.featureOptionRepository.find({
        where: { id: In(allOptionIds) },
      });
      optionsMap = new Map(options.map(opt => [opt.id, opt]));
    }

    for (const fv of featureValues) {
      const code = fv.feature_category?.code;
      if (!code) continue;

      const inputType = fv.feature_category?.input_type;

      if ((inputType === 'multi_select' || inputType === 'single_select') && fv.feature_option_ids?.length > 0) {
        // Get option values from our map
        const optionValues = fv.feature_option_ids
          .map((id: string) => optionsMap.get(id))
          .filter(Boolean)
          .map((opt: any) => opt.value || opt.name);

        if (inputType === 'multi_select') {
          features[code] = optionValues;
        } else {
          features[code] = optionValues[0] || null;
        }
      } else if (fv.values) {
        // Text or numeric input
        features[code] = fv.values;
      }
    }

    return features;
  }

  /**
   * NEW: Reindex all properties for a specific category
   * Useful when category name/details are updated
   */
  async reindexByCategory(categoryId: string): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
  }> {
    this.logger.log(`Reindexing properties for category: ${categoryId}`);

    const properties = await this.propertyRepository.find({
      where: { property_category_id: categoryId },
      select: ['id'],
    });

    if (properties.length === 0) {
      return { success: true, indexed: 0, failed: 0 };
    }

    const propertyIds = properties.map(p => p.id);
    return this.reindexByIds(propertyIds);
  }
}