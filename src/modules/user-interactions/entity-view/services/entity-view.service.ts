import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EntityView } from '../../entities/entity-view.entity';
import { Property } from '../../../property/entities/properties.entity';
import { Ad } from '../../../ads/entities/ad.entity';
import { GetRecentlyViewedDto, ViewEntityType } from '../dto/entity-view.dto';

@Injectable()
export class EntityViewService {

  constructor(
    @InjectRepository(EntityView)
    private readonly viewRepository: Repository<EntityView>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Ad)
    private readonly adRepository: Repository<Ad>,
  ) {}

  /**
   * Record a view (create or update)
   */
  async recordView(
    userId: string,
    entityType: ViewEntityType,
    entityId: string,
  ): Promise<EntityView> {
    // Check if view already exists
    const existingView = await this.viewRepository.findOne({
      where: {
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
      },
    });

    if (existingView) {
      // Update existing view - increment count and update timestamp
      existingView.view_count += 1;
      existingView.last_viewed_at = new Date();
      return this.viewRepository.save(existingView);
    }

    // Create new view record
    const newView = this.viewRepository.create({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      view_count: 1,
      last_viewed_at: new Date(),
    });

    return this.viewRepository.save(newView);
  }

  /**
   * Get recently viewed entities for a user (with entity details)
   */
  async getRecentlyViewed(
    userId: string,
    dto: GetRecentlyViewedDto,
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { entity_type, page = 1, limit = 10 } = dto;

    const whereCondition: any = { user_id: userId };
    if (entity_type) {
      whereCondition.entity_type = entity_type;
    }

    const [views, total] = await this.viewRepository.findAndCount({
      where: whereCondition,
      order: { last_viewed_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Populate entity details
    const populatedViews = await this.populateEntityDetails(views);

    return {
      data: populatedViews,
      total,
      page,
      limit,
    };
  }

  /**
   * Get recently viewed properties
   */
  async getRecentlyViewedProperties(
    userId: string,
    page = 1,
    limit = 10,
  ) {
    return this.getRecentlyViewed(userId, {
      entity_type: ViewEntityType.PROPERTY,
      page,
      limit,
    });
  }

  /**
   * Get recently viewed ads
   */
  async getRecentlyViewedAds(
    userId: string,
    page = 1,
    limit = 10,
  ) {
    return this.getRecentlyViewed(userId, {
      entity_type: ViewEntityType.AD,
      page,
      limit,
    });
  }

  /**
   * Clear view history for a user
   */
  async clearHistory(
    userId: string,
    entityType?: ViewEntityType,
  ): Promise<{ deleted: number }> {
    const whereCondition: any = { user_id: userId };
    if (entityType) {
      whereCondition.entity_type = entityType;
    }

    const result = await this.viewRepository.delete(whereCondition);
    return { deleted: result.affected || 0 };
  }

  /**
   * Remove a single view record
   */
  async removeView(
    userId: string,
    entityType: ViewEntityType,
    entityId: string,
  ): Promise<{ success: boolean }> {
    const result = await this.viewRepository.delete({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
    });
    return { success: (result.affected || 0) > 0 };
  }

  /**
   * Get view count for a specific entity by user
   */
  async getUserViewCount(
    userId: string,
    entityType: ViewEntityType,
    entityId: string,
  ): Promise<number> {
    const view = await this.viewRepository.findOne({
      where: {
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
      },
    });
    return view?.view_count || 0;
  }

  /**
   * Populate entity details (property or ad)
   */
  private async populateEntityDetails(views: EntityView[]): Promise<any[]> {
    if (views.length === 0) return [];

    // Separate by entity type
    const propertyViews = views.filter(v => v.entity_type === ViewEntityType.PROPERTY);
    const adViews = views.filter(v => v.entity_type === ViewEntityType.AD);

    // Fetch properties
    const propertyIds = propertyViews.map(v => v.entity_id);
    const properties = propertyIds.length > 0
      ? await this.propertyRepository.find({
        where: { id: In(propertyIds) },
        relations: ['media'],
      })
      : [];

    // Fetch ads
    const adIds = adViews.map(v => v.entity_id);
    const ads = adIds.length > 0
      ? await this.adRepository.find({
        where: { id: In(adIds) },
        relations: ['images'],
      })
      : [];

    // Create lookup maps
    const propertyMap = new Map(properties.map(p => [p.id, p]));
    const adMap = new Map(ads.map(a => [a.id, a]));

    // Populate views with entity details
    return views.map(view => {
      let entity: Property | Ad | null = null;
      if (view.entity_type === ViewEntityType.PROPERTY) {
        entity = propertyMap.get(view.entity_id) || null;
      } else if (view.entity_type === ViewEntityType.AD) {
        entity = adMap.get(view.entity_id) || null;
      }

      return {
        id: view.id,
        entity_type: view.entity_type,
        entity_id: view.entity_id,
        view_count: view.view_count,
        last_viewed_at: view.last_viewed_at,
        created_at: view.created_at,
        entity,
      };
    });
  }
}