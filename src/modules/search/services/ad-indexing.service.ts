import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticsearchService } from './elasticsearch.service';
import { Ad } from '../../ads/entities/ad.entity';

@Injectable()
export class AdIndexingService {
  private readonly logger = new Logger(AdIndexingService.name);
  private readonly indexName: string;
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    @InjectRepository(Ad)
    private readonly adRepository: Repository<Ad>,
  ) {
    this.indexName = this.elasticsearchService.getIndexName('ads');
  }

  /**
   * Index a single ad by ID
   */
  async indexAd(adId: string): Promise<void> {
    this.logger.log(`Indexing ad: ${adId}`);

    const ad = await this.fetchAdWithRelations(adId);

    if (!ad) {
      this.logger.warn(`Ad not found: ${adId}`);
      return;
    }

    const document = this.transformToEsDocument(ad);
    await this.elasticsearchService.indexDocument(this.indexName, adId, document);

    this.logger.log(`Ad indexed: ${adId}`);
  }

  /**
   * Remove an ad from ES index
   */
  async removeAd(adId: string): Promise<void> {
    this.logger.log(`Removing ad from index: ${adId}`);
    await this.elasticsearchService.deleteDocument(this.indexName, adId);
  }

  /**
   * Update ad in ES (re-index)
   */
  async updateAd(adId: string): Promise<void> {
    await this.indexAd(adId);
  }

  /**
   * Bulk index all ads
   */
  async reindexAll(): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
    took: number;
  }> {
    this.logger.log('Starting full reindex of all ads');
    const startTime = Date.now();

    let indexed = 0;
    let failed = 0;

    try {
      const total = await this.adRepository.count();
      this.logger.log(`Total ads to index: ${total}`);

      let offset = 0;
      while (offset < total) {
        const ads = await this.fetchAdsBatch(offset, this.BATCH_SIZE);

        if (ads.length === 0) break;

        const documents = ads.map(ad => this.transformToEsDocument(ad));

        const result = await this.elasticsearchService.bulkIndex(this.indexName, documents);

        indexed += result.success;
        failed += result.failed;

        if (result.errors.length > 0) {
          this.logger.warn(`Batch errors: ${result.errors.join(', ')}`);
        }

        this.logger.log(`Indexed batch ${offset + 1}-${offset + ads.length} of ${total}`);

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
   * Reindex ads by IDs
   */
  async reindexByIds(adIds: string[]): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
  }> {
    let indexed = 0;
    let failed = 0;

    for (const id of adIds) {
      try {
        await this.indexAd(id);
        indexed++;
      } catch (error) {
        this.logger.error(`Failed to index ad ${id}`, error.message);
        failed++;
      }
    }

    return { success: failed === 0, indexed, failed };
  }

  /**
   * NEW: Reindex all ads for a specific category
   */
  async reindexByCategory(categoryId: string): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
  }> {
    this.logger.log(`Reindexing ads for category: ${categoryId}`);

    const ads = await this.adRepository.find({
      where: { category_id: categoryId },
      select: ['id'],
    });

    if (ads.length === 0) {
      return { success: true, indexed: 0, failed: 0 };
    }

    const adIds = ads.map(a => a.id);
    return this.reindexByIds(adIds);
  }

  /**
   * Fetch ad with relations
   */
  private async fetchAdWithRelations(adId: string): Promise<Ad | null> {
    return this.adRepository.findOne({
      where: { id: adId },
      relations: ['category', 'category.parent', 'images'],
    });
  }

  /**
   * Fetch ads batch
   */
  private async fetchAdsBatch(offset: number, limit: number): Promise<Ad[]> {
    return this.adRepository.find({
      relations: ['category', 'category.parent', 'images'],
      skip: offset,
      take: limit,
      order: { created_at: 'ASC' },
    });
  }

  /**
   * Transform Ad entity to ES document
   * UPDATED: Now includes category as object for category name search
   */
  private transformToEsDocument(ad: Ad): any {
    // Build images array
    const images = (ad.images || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(img => ({
        id: img.id,
        url: img.url,
        thumbnail_url: img.thumbnail_url,
        is_primary: img.is_primary || false,
        sort_order: img.sort_order,
      }));

    // ============================================
    // NEW: Build category object
    // ============================================
    const categoryObject = ad.category ? {
      id: ad.category.id,
      name: ad.category.name,
      description: ad.category.description || null,
      parent_id: ad.category.parent_id || null,
      parent_name: ad.category.parent?.name || null,
      icon: ad.category.icon || null,
    } : null;

    return {
      id: ad.id,
      title: ad.title,
      description: ad.description,

      // Category - both ID and full object
      category_id: ad.category_id,
      category: categoryObject,

      // Keep flat fields for backward compatibility
      category_name: ad.category?.name || null,
      category_parent_id: ad.category?.parent_id || null,
      category_parent_name: ad.category?.parent?.name || null,

      price: parseFloat(ad.price?.toString() || '0'),
      price_unit: ad.price_unit,
      is_negotiable: ad.is_negotiable || false,

      status: ad.status,

      door_number: ad.door_number,
      street_name: ad.street_name,
      address_line: ad.address_line,
      city: ad.city,
      district: ad.district,
      state: ad.state,
      postal_code: ad.postal_code,
      country: ad.country,

      location: ad.latitude && ad.longitude
        ? {
          lat: parseFloat(ad.latitude.toString()),
          lon: parseFloat(ad.longitude.toString()),
        }
        : null,

      contact_name: ad.contact_name,
      contact_phone: ad.contact_phone,
      contact_email: ad.contact_email,

      owner_id: ad.owner_id,

      is_boosted: ad.is_boosted || false,
      active_boost_type: ad.active_boost_type,
      boost_expires_at: ad.boost_expires_at?.toISOString() || null,
      boost_priority: ad.boost_priority || 0,
      is_top_listing: ad.is_top_listing || false,
      top_listing_expires_at: ad.top_listing_expires_at?.toISOString() || null,

      approval_status: ad.approval_status,
      is_published: ad.is_published || false,
      is_verified: ad.is_verified || false,
      is_premium: ad.is_premium || false,
      is_featured: ad.is_featured || false,
      is_active: ad.is_active !== false,

      slug: ad.slug,
      meta_description: ad.meta_description,
      meta_keywords: ad.meta_keywords,

      view_count: ad.view_count || 0,
      favorite_count: ad.favorite_count || 0,
      contact_count: ad.contact_count || 0,
      click_count: ad.click_count || 0,

      expires_at: ad.expires_at?.toISOString() || null,
      created_at: ad.created_at?.toISOString(),
      updated_at: ad.updated_at?.toISOString(),
      published_at: ad.published_at?.toISOString() || null,
      approved_at: ad.approved_at?.toISOString() || null,

      images,
    };
  }
}