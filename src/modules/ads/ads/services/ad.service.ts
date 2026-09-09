import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Ad } from '../../entities/ad.entity';
import { CreateAdDto } from '../dto/create-ad.dto';
import { UpdateAdDto } from '../dto/update-ad.dto';
import { EntityType } from '../../../user-interactions/dto';
import { Favorite } from '../../../user-interactions/entities/favorite.entity';
import { EntityView } from '../../../user-interactions/entities/entity-view.entity';
import { Enquiry } from '../../../user-interactions/entities/enquiry.entity';
import { AdIndexingService } from '../../../search/services/ad-indexing.service';
import { UserType } from '../../../users/enums/usertype';

@Injectable()
export class AdService {
  constructor(
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(Favorite)
    private favRepo: Repository<Favorite>,
    @InjectRepository(EntityView)
    private entityViewRepo: Repository<EntityView>,
    @InjectRepository(Enquiry)
    private readonly enquiryRepo: Repository<Enquiry>,
    private readonly adIndexingService: AdIndexingService
  ) {}

  async findAll(
    page = 1,
    limit = 10,
    filters: {
      status?: string;
      category_id?: string;
      city?: string;
      approval_status?: string;
    },
    userId?: string,
    userRoles?: string[]
  ) {
    const skipCount = (page - 1) * limit;
    const whereConditions = this.buildWhereConditions(filters);

    if (!userRoles?.includes(UserType.ADMIN)) {
      whereConditions.owner_id = userId;
    }

    const queryOptions = {
      where: whereConditions,
      order: { created_at: 'DESC' as const },
      ...(limit > 0 && { skip: skipCount, take: limit }),
      relations: { images: true, category: true }
    };

    const [data, total] = await this.adRepo.findAndCount(queryOptions);

    let dataWithExtras = data.map((ad) => ({
      ...ad,
      category_name: ad.category?.name || null
    }));

    if (userId) {
      const favoriteEntities = await this.favRepo.find({
        where: {
          user_id: userId,
          entity_type: EntityType.AD
        }
      });

      const favoriteAdIds = favoriteEntities.map((f) => f.entity_id);

      dataWithExtras = dataWithExtras.map((ad) => ({
        ...ad,
        is_user_favorite: favoriteAdIds.includes(ad.id)
      }));
    }

    return {
      data: dataWithExtras,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total
    };
  }

  async findMyFavorites(
    page = 1,
    limit = 10,
    filters: {
      status?: string;
      category_id?: string;
      city?: string;
      approval_status?: string;
    },
    userId?: string
  ) {
    const skipCount = (page - 1) * limit;

    const favoriteEntities = await this.favRepo.find({
      where: {
        user_id: userId,
        entity_type: EntityType.AD
      }
    });

    const favoriteAdIds = favoriteEntities.map((f) => f.entity_id);

    if (!favoriteAdIds.length) {
      return { data: [], total: 0, page, limit };
    }

    const whereConditions = this.buildWhereConditions(filters);
    whereConditions.id = In(favoriteAdIds);

    const queryOptions = {
      where: whereConditions,
      order: { created_at: 'DESC' as const },
      ...(limit > 0 && { skip: skipCount, take: limit }),
      relations: { images: true, category: true }
    };

    const [data, total] = await this.adRepo.findAndCount(queryOptions);

    const dataWithExtras = data.map((ad) => ({
      ...ad,
      category_name: ad.category?.name || null,
      is_user_favorite: true
    }));

    return {
      data: dataWithExtras,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total
    };
  }

  private buildWhereConditions(filters: {
    status?: string;
    category_id?: string;
    city?: string;
    approval_status?: string;
  }) {
    const conditions: any = { is_active: true };

    if (filters.status) {
      conditions.status = filters.status;
    }

    if (filters.category_id) {
      conditions.category_id = filters.category_id;
    }

    if (filters.city) {
      conditions.city = filters.city;
    }

    if (filters.approval_status) {
      conditions.approval_status = filters.approval_status;
    }

    return conditions;
  }

  async findOne(
    id: string,
    userId?: string,
    userRoles?: string[],
    recordView: boolean = false
  ) {
    const entity = await this.adRepo.findOne({
      where: { id },
      relations: {
        images: true,
        approvals: true,
        reports: true,
        category: true,
        owner: true
      }
    });

    if (!entity) throw new NotFoundException('Ad not found');

    if (userId && recordView) {
      await this.recordAdView(id, userId);
    }

    let data: any = {
      ...entity,
      category_name: entity.category?.name || null,
      is_user_favorite: false
    };

    if (userId) {
      const isDisplayAllRecords =
        userRoles?.includes(UserType.ADMIN) || entity.owner_id === userId;
      data.enquiries = await this.getAdEnquiries(
        id,
        userId,
        isDisplayAllRecords
      );

      data.is_user_favorite = !!(await this.favRepo.findOne({
        where: {
          entity_type: EntityType.AD,
          entity_id: entity.id,
          user_id: userId
        }
      }));
    }

    return data;
  }

  private async getAdEnquiries(
    adId: string,
    userId: string,
    isDisplayAllRecords: boolean
  ): Promise<any[]> {
    const queryBuilder = this.enquiryRepo
      .createQueryBuilder('enquiry')
      .leftJoinAndSelect('enquiry.lead_statuses', 'lead_status')
      .leftJoinAndSelect('enquiry.user', 'enquiry_user')
      .where('enquiry.entity_type = :entityType', { entityType: EntityType.AD })
      .andWhere('enquiry.entity_id = :adId', { adId })
      .orderBy('enquiry.created_at', 'DESC')
      .addOrderBy('lead_status.created_at', 'DESC');

    if (!isDisplayAllRecords) {
      queryBuilder.andWhere('enquiry.user_id = :userId', { userId });
    }

    const enquiries = await queryBuilder.getMany();

    return enquiries.map((enquiry) => ({
      id: enquiry.id,
      name: enquiry.name,
      email: enquiry.email,
      phone: enquiry.phone,
      message: enquiry.message,
      status: enquiry.status,
      created_at: enquiry.created_at,
      updated_at: enquiry.updated_at,
      lead_statuses:
        enquiry.lead_statuses?.map((ls) => ({
          id: ls.id,
          status: ls.status,
          notes: ls.notes,
          follow_up_date: ls.follow_up_date,
          created_at: ls.created_at
        })) || [],
      user: isDisplayAllRecords
        ? {
            id: enquiry.user?.id,
            firstName: enquiry.user?.firstName,
            lastName: enquiry.user?.lastName
          }
        : null
    }));
  }

  async myAds(ownerId: string, page = 1, limit = 10) {
    const skipCount = (page - 1) * limit;

    const [data, total] = await this.adRepo.findAndCount({
      where: { owner_id: ownerId, is_active: true },
      order: { created_at: 'DESC' },
      ...(limit > 0 && { skip: skipCount, take: limit }),
      relations: { images: true, category: true }
    });

    const dataWithExtras = data.map((ad) => ({
      ...ad,
      category_name: ad.category?.name || null
    }));

    return {
      data: dataWithExtras,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total
    };
  }

  async create(dto: CreateAdDto, userId: string) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const entity = new Ad();

    entity.title = dto.title;
    entity.description = dto.description;
    entity.category_id = dto.category_id;
    entity.price = dto.price;
    entity.city = dto.city;
    entity.door_number = dto.door_number;
    entity.street_name = dto.street_name;
    entity.district = dto.district;
    entity.state = dto.state;
    entity.postal_code = dto.postal_code;
    entity.country = dto.country;
    entity.owner_id = userId;

    entity.price_unit = dto.price_unit || 'USD';
    entity.is_negotiable = dto.is_negotiable || false;
    entity.status = dto.status || 'AVAILABLE';
    entity.address_line = dto.address_line;
    entity.latitude = dto.latitude;
    entity.longitude = dto.longitude;
    entity.contact_name = dto.contact_name;
    entity.contact_phone = dto.contact_phone;
    entity.contact_email = dto.contact_email;
    entity.is_premium = dto.is_premium || false;
    entity.is_featured = dto.is_featured || false;
    entity.slug = dto.slug;
    entity.meta_description = dto.meta_description;
    entity.meta_keywords = dto.meta_keywords;

    if (dto.expires_in_days) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + dto.expires_in_days);
      entity.expires_at = expiresAt;
    }

    if (dto.is_boosted && dto.boost_duration_days) {
      const boostExpiresAt = new Date();
      boostExpiresAt.setDate(
        boostExpiresAt.getDate() + dto.boost_duration_days
      );
      entity.is_boosted = true;
      entity.active_boost_type = dto.boost_type || 'PREMIUM';
      entity.boost_expires_at = boostExpiresAt;
      entity.boost_priority = dto.boost_priority || 1;
    }

    if (dto.is_top_listing && dto.top_listing_duration_days) {
      const topListingExpiresAt = new Date();
      topListingExpiresAt.setDate(
        topListingExpiresAt.getDate() + dto.top_listing_duration_days
      );
      entity.is_top_listing = true;
      entity.top_listing_expires_at = topListingExpiresAt;
    }

    const saved = await this.adRepo.save(entity);
    await this.adIndexingService.indexAd(saved.id);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateAdDto) {
    const existing = await this.findOne(id);

    await this.adRepo.update(id, {
      title: dto.title ?? existing.title,
      description: dto.description ?? existing.description,
      category_id: dto.category_id ?? existing.category_id,
      price: dto.price ?? existing.price,
      price_unit: dto.price_unit ?? existing.price_unit,
      is_negotiable: dto.is_negotiable ?? existing.is_negotiable,
      status: dto.status ?? existing.status,
      door_number: dto.door_number ?? existing.door_number,
      street_name: dto.street_name ?? existing.street_name,
      address_line: dto.address_line ?? existing.address_line,
      city: dto.city ?? existing.city,
      district: dto.district ?? existing.district,
      state: dto.state ?? existing.state,
      postal_code: dto.postal_code ?? existing.postal_code,
      country: dto.country ?? existing.country,
      latitude: dto.latitude ?? existing.latitude,
      longitude: dto.longitude ?? existing.longitude,
      contact_name: dto.contact_name ?? existing.contact_name,
      contact_phone: dto.contact_phone ?? existing.contact_phone,
      contact_email: dto.contact_email ?? existing.contact_email,
      is_premium: dto.is_premium ?? existing.is_premium,
      is_featured: dto.is_featured ?? existing.is_featured,
      slug: dto.slug ?? existing.slug,
      meta_description: dto.meta_description ?? existing.meta_description,
      meta_keywords: dto.meta_keywords ?? existing.meta_keywords,
      is_published: false,
      is_verified: false,
      approval_status: 'UNDER_REVIEW',
      published_at:
        dto.is_published !== undefined
          ? dto.is_published
            ? new Date()
            : null
          : existing.published_at
    } as any);

    if (dto.is_boosted !== undefined) {
      if (dto.is_boosted && dto.boost_duration_days) {
        const boostExpiresAt = new Date();
        boostExpiresAt.setDate(
          boostExpiresAt.getDate() + dto.boost_duration_days
        );
        await this.adRepo.update(id, {
          is_boosted: true,
          active_boost_type:
            dto.boost_type || existing.active_boost_type || 'PREMIUM',
          boost_expires_at: boostExpiresAt,
          boost_priority: dto.boost_priority ?? existing.boost_priority ?? 1
        });
      } else if (!dto.is_boosted) {
        await this.adRepo.update(id, {
          is_boosted: false,
          boost_expires_at: undefined,
          boost_priority: 0
        });
      }
    }

    if (dto.is_top_listing !== undefined) {
      if (dto.is_top_listing && dto.top_listing_duration_days) {
        const topListingExpiresAt = new Date();
        topListingExpiresAt.setDate(
          topListingExpiresAt.getDate() + dto.top_listing_duration_days
        );
        await this.adRepo.update(id, {
          is_top_listing: true,
          top_listing_expires_at: topListingExpiresAt
        });
      } else if (!dto.is_top_listing) {
        await this.adRepo.update(id, {
          is_top_listing: false,
          top_listing_expires_at: undefined
        });
      }
    }

    await this.adIndexingService.updateAd(id);

    return this.findOne(id);
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.adRepo.delete(id);
    await this.adIndexingService.removeAd(id);
    return { success: true };
  }

  async publish(id: string) {
    await this.adRepo.update(id, {
      is_published: true,
      published_at: new Date()
    });
    await this.adIndexingService.updateAd(id);
    return this.findOne(id);
  }

  async unpublish(id: string) {
    await this.adRepo.update(id, {
      is_published: false,
      published_at: undefined
    });
    await this.adIndexingService.updateAd(id);
    return this.findOne(id);
  }

  async boostAd(
    id: string,
    boostType = 'PREMIUM',
    boostDurationDays = 30,
    priority = 1
  ) {
    const boostExpiresAt = new Date();
    boostExpiresAt.setDate(boostExpiresAt.getDate() + boostDurationDays);

    await this.adRepo.update(id, {
      is_boosted: true,
      active_boost_type: boostType,
      boost_expires_at: boostExpiresAt,
      boost_priority: priority
    });
    await this.adIndexingService.updateAd(id);
    return this.findOne(id);
  }

  async makeTopListing(id: string, topListingDurationDays = 7) {
    const topListingExpiresAt = new Date();
    topListingExpiresAt.setDate(
      topListingExpiresAt.getDate() + topListingDurationDays
    );

    await this.adRepo.update(id, {
      is_top_listing: true,
      top_listing_expires_at: topListingExpiresAt
    });
    await this.adIndexingService.updateAd(id);
    return this.findOne(id);
  }

  async removeBoost(id: string) {
    await this.adRepo.update(id, {
      is_boosted: false,
      boost_expires_at: undefined,
      boost_priority: 0
    });
    await this.adIndexingService.updateAd(id);
    return this.findOne(id);
  }

  async removeTopListing(id: string) {
    await this.adRepo.update(id, {
      is_top_listing: false,
      top_listing_expires_at: undefined
    });
    await this.adIndexingService.updateAd(id);
    return this.findOne(id);
  }

  async getBoostedAds(page = 1, limit = 10) {
    const [data, total] = await this.adRepo.findAndCount({
      where: {
        is_active: true,
        is_boosted: true,
        is_published: true
      },
      order: {
        boost_priority: 'DESC',
        boost_expires_at: 'DESC',
        created_at: 'DESC'
      },
      skip: (page - 1) * limit,
      take: limit,
      relations: { images: true, category: true }
    });

    const dataWithExtras = data.map((ad) => ({
      ...ad,
      category_name: ad.category?.name || null
    }));

    return { data: dataWithExtras, total, page, limit };
  }

  async getTopListings(page = 1, limit = 10) {
    const [data, total] = await this.adRepo.findAndCount({
      where: {
        is_active: true,
        is_top_listing: true,
        is_published: true
      },
      order: {
        top_listing_expires_at: 'DESC',
        created_at: 'DESC'
      },
      ...(limit > 0 && { skip: (page - 1) * limit, take: limit }),
      relations: { images: true, category: true }
    });

    const dataWithExtras = data.map((ad) => ({
      ...ad,
      category_name: ad.category?.name || null
    }));

    return {
      data: dataWithExtras,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total
    };
  }

  async findAllEnhanced(page = 1, limit = 10) {
    const [data, total] = await this.adRepo.findAndCount({
      where: { is_active: true, is_published: true },
      order: {
        is_top_listing: 'DESC',
        is_boosted: 'DESC',
        boost_priority: 'DESC',
        is_premium: 'DESC',
        is_featured: 'DESC',
        created_at: 'DESC'
      },
      skip: (page - 1) * limit,
      take: limit,
      relations: { images: true, category: true }
    });

    const dataWithExtras = data.map((ad) => ({
      ...ad,
      category_name: ad.category?.name || null
    }));

    return { data: dataWithExtras, total, page, limit };
  }

  async updateStatus(id: string, status: string, note?: string) {
    const ad = await this.adRepo.findOne({ where: { id } });

    if (!ad) {
      throw new NotFoundException('Ad not found');
    }

    const updateData: any = { status };

    if (status === 'SOLD' || status === 'RESERVED') {
      updateData.is_published = false;
      updateData.is_boosted = false;
      updateData.is_top_listing = false;
      updateData.boost_expires_at = null;
      updateData.top_listing_expires_at = null;
    }

    if (status === 'AVAILABLE') {
      updateData.is_active = true;
    }

    if (status === 'WITHDRAWN') {
      updateData.is_active = false;
      updateData.is_published = false;
    }

    await this.adRepo.update(id, updateData);
    await this.adIndexingService.updateAd(id);

    return this.findOne(id);
  }

  async incrementContactCount(id: string) {
    await this.adRepo.increment({ id }, 'contact_count', 1);
  }

  async incrementClickCount(id: string) {
    await this.adRepo.increment({ id }, 'click_count', 1);
  }

  private async recordAdView(adId: string, userId: string): Promise<void> {
    try {
      const existingView = await this.entityViewRepo.findOne({
        where: {
          user_id: userId,
          entity_type: 'AD',
          entity_id: adId
        }
      });

      if (existingView) {
        // Same user revisiting — update last seen only; do NOT bump ad view_count
        await this.entityViewRepo.update(existingView.id, {
          last_viewed_at: new Date()
        });
        return;
      }

      const newView = this.entityViewRepo.create({
        user_id: userId,
        entity_type: 'AD',
        entity_id: adId,
        view_count: 1,
        last_viewed_at: new Date()
      });
      await this.entityViewRepo.save(newView);

      // Unique viewer: increment once per user
      await this.adRepo.increment({ id: adId }, 'view_count', 1);
    } catch (error) {
      console.error(
        'Failed to record ad view:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
