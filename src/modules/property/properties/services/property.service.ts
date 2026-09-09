import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Property } from '../../entities/properties.entity';
import { PropertyFeatureValue } from '../../entities/property-feature-value.entity';
import { CreatePropertyDto } from '../dto/create-property.dto';
import { UpdatePropertyDto } from '../dto/update-property.dto';
import { PropertyFeatureValueDto } from '../dto/property-feature-value.dto';
import { FeatureGroup } from '../../../master/entities/feature-group.entity';
import { FeatureCategory } from '../../../master/entities/feature-category.entity';
import { FeatureOption } from '../../../master/entities/feature-option.entity';
import { InputType } from '../../../master/enums/InputType';
import { PropertyFeatureValueResponseDto } from '../dto/property-feature-value-response.dto';
import { PropertyResponseDto } from '../dto/property-response.dto';
import { Favorite } from '../../../user-interactions/entities/favorite.entity';
import { EntityType } from '../../../user-interactions/dto';
import { User } from '../../../users/entities/user.entity';
import { AgentCompanyProfile } from '../../../users/entities/agent-company-profile.entity';
import { UserType } from '../../../users/enums/usertype';
import { PropertyIndexingService } from '../../../search';
import { PropertyStatus } from '../dto/update-property-status.dto';
import { EntityView } from '../../../user-interactions/entities/entity-view.entity';
import { Enquiry } from '../../../user-interactions/entities/enquiry.entity';
import { NotificationService } from '../../../notification/services/notification.service';
import { PropertyCategory } from '../../../master/entities/property-category.entity';
import { isLayoutCategoryName } from '../utils/property-category.util';
import { NotificationEntityType } from '../../../notification/enums/notification.enum';

@Injectable()
export class PropertyService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AgentCompanyProfile)
    private readonly agentCompanyProfileRepo: Repository<AgentCompanyProfile>,
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(PropertyCategory)
    private readonly propertyCategoryRepo: Repository<PropertyCategory>,
    @InjectRepository(PropertyFeatureValue)
    private readonly featureRepo: Repository<PropertyFeatureValue>,
    @InjectRepository(FeatureGroup)
    private featureGroupRepo: Repository<FeatureGroup>,
    @InjectRepository(FeatureCategory)
    private featureCategoryRepo: Repository<FeatureCategory>,
    @InjectRepository(FeatureOption)
    private featureOptionRepo: Repository<FeatureOption>,
    @InjectRepository(Favorite)
    private favRepo: Repository<Favorite>,
    @InjectRepository(EntityView)
    private entityViewRepo: Repository<EntityView>,
    @InjectRepository(Enquiry)
    private readonly enquiryRepo: Repository<Enquiry>,
    private readonly propertyIndexingService: PropertyIndexingService,
    private readonly notificationService: NotificationService
  ) {}

  async findAll(
    page = 1,
    limit = 10,
    filters: {
      status: string | undefined;
      listing_type: string | undefined;
      approval_status?: string | null;
    },
    userId?: string,
    userRoles?: string[]
  ) {
    const skipCount = (page - 1) * limit;
    const whereConditions = this.buildWhereConditions(filters);

    if (!userRoles?.some((role) => String(role).toUpperCase() === UserType.ADMIN)) {
      whereConditions.owner_id = userId;
    }

    const queryOptions = {
      where: whereConditions,
      order: { created_at: 'DESC' as const },
      ...(limit > 0 && { skip: skipCount, take: limit }),
      relations: {
        media: true,
        property_category: true
      }
    };

    const [data, total] = await this.propertyRepo.findAndCount(queryOptions);

    let dataWithExtras = data.map((property) => ({
      ...property,
      property_category_name: property.property_category?.name || null
    }));

    if (userId) {
      const favoriteEntities = await this.favRepo.find({
        where: {
          user_id: userId,
          entity_type: EntityType.PROPERTY
        }
      });

      const favoritePropertyIds = favoriteEntities.map((f) => f.entity_id);

      dataWithExtras = dataWithExtras.map((property) => ({
        ...property,
        is_user_favorite: favoritePropertyIds.includes(property.id)
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
      status: string | undefined;
      listing_type: string | undefined;
      approval_status?: string | null;
    },
    userId?: string
  ) {
    const skipCount = (page - 1) * limit;

    const favoriteEntities = await this.favRepo.find({
      where: {
        user_id: userId,
        entity_type: EntityType.PROPERTY
      }
    });

    const favoritePropertyIds = favoriteEntities.map((f) => f.entity_id);

    if (!favoritePropertyIds.length) {
      return { data: [], total: 0, page, limit };
    }

    const whereConditions = this.buildWhereConditions(filters);
    whereConditions.id = In(favoritePropertyIds);

    const queryOptions = {
      where: whereConditions,
      order: { created_at: 'DESC' as const },
      ...(limit > 0 && { skip: skipCount, take: limit }),
      relations: {
        media: true,
        property_category: true
      }
    };

    const [data, total] = await this.propertyRepo.findAndCount(queryOptions);

    const dataWithExtras = data.map((property) => ({
      ...property,
      property_category_name: property.property_category?.name || null,
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
    status: string | undefined;
    listing_type: string | undefined;
    approval_status?: string | null;
  }) {
    const conditions: any = { is_active: true };

    if (filters.status) {
      conditions.status = filters.status;
    }

    if (filters.listing_type) {
      conditions.listing_type = filters.listing_type;
    }

    if (filters.approval_status) {
      conditions.approval_status = filters.approval_status;
    }

    return conditions;
  }

  private async resolveCategoryName(categoryId?: string | null): Promise<string | null> {
    if (!categoryId) return null;
    const category = await this.propertyCategoryRepo.findOne({ where: { id: categoryId } });
    return category?.name ?? null;
  }

  /** Map layout fields ↔ price/size based on property category. */
  private async applyCategoryFieldRules<T extends CreatePropertyDto | UpdatePropertyDto>(
    dto: T,
    categoryId: string,
  ): Promise<T> {
    const categoryName = await this.resolveCategoryName(categoryId);
    const isLayout = isLayoutCategoryName(categoryName);
    const payload = dto as any;

    if (isLayout) {
      if (payload.layout_price_min != null && payload.layout_price_min !== '') {
        payload.price = Number(payload.layout_price_min);
      }
      if (payload.layout_area_min_sqft != null && payload.layout_area_min_sqft !== '') {
        payload.property_size = Number(payload.layout_area_min_sqft);
        payload.property_size_unit = payload.layout_area_unit || 'Sqft';
      }
      payload.project_status = payload.project_status ?? 'CURRENT';
    } else {
      payload.project_status = payload.project_status ?? 'CURRENT';
      payload.layout_price_min = null;
      payload.layout_price_max = null;
      payload.layout_area_min_sqft = null;
      payload.layout_area_max_sqft = null;
      payload.layout_area_unit = null;
      payload.plot_total_count = null;
      payload.plot_sold_count = null;
      payload.plot_booked_count = null;
      payload.plot_available_count = null;
      payload.layout_total_sqft = null;
    }

    return dto;
  }

  async findOne(
    id: string,
    userId?: string,
    userRoles?: string[],
    recordView: boolean = false
  ): Promise<PropertyResponseDto> {
    const entity = await this.propertyRepo.findOne({
      where: { id },
      relations: {
        media: true,
        approvals: true,
        feature_values: true,
        reports: true,
        property_category: true
      }
    });

    if (!entity) throw new NotFoundException('Property not found');

    if (userId && recordView) {
      // Don't count the owner's own visits toward page views
      if (entity.owner_id !== userId) {
        await this.recordPropertyView(id, userId);
      }
    }

    const responseDto: PropertyResponseDto = {
      ...entity,
      property_category_name: entity.property_category?.name || null
    } as any as PropertyResponseDto;

    if (userId) {
      const isDisplayAllRecords =
        userRoles?.includes(UserType.ADMIN) || entity.owner_id === userId;
      responseDto.enquiries = await this.getPropertyEnquiries(
        id,
        userId,
        isDisplayAllRecords
      );
    }

    if (entity.feature_values && entity.feature_values.length > 0) {
      const featureGroupIds: string[] = entity.feature_values
        .filter((fv) => fv.feature_group_id)
        .map((fv) => fv.feature_group_id);

      const featureCategoryIds: string[] = entity.feature_values.map(
        (fv) => fv.feature_category_id
      );

      const featureOptionIds: string[] = entity.feature_values.flatMap(
        (fv) => fv.feature_option_ids || []
      );

      const featureGroups = featureGroupIds.length
        ? await this.featureGroupRepo.find({
            where: { id: In(featureGroupIds) }
          })
        : [];

      const featureCategories = await this.featureCategoryRepo.find({
        where: { id: In(featureCategoryIds) }
      });

      const featureOptions = featureOptionIds.length
        ? await this.featureOptionRepo.find({
            where: { id: In(featureOptionIds) }
          })
        : [];

      responseDto.feature_values = entity.feature_values.map((fv) => {
        const featureGroup = fv.feature_group_id
          ? featureGroups.find((fg) => fg.id === fv.feature_group_id)
          : null;

        const featureCategory = featureCategories.find(
          (fc) => fc.id === fv.feature_category_id
        );

        let displayValue: string | null = null;
        let featureOptionsData: FeatureOption[] = [];

        if (featureCategory) {
          const categoryInputType = featureCategory.input_type as string;

          if (
            [InputType.SINGLE_SELECT, InputType.MULTI_SELECT].includes(
              categoryInputType as InputType
            )
          ) {
            featureOptionsData = (fv.feature_option_ids || [])
              .map((optionId) => {
                const option = featureOptions.find(
                  (opt) => opt.id === optionId
                );
                return option ? option : null;
              })
              .filter(Boolean) as FeatureOption[];

            displayValue = featureOptionsData.map((opt) => opt.name).join(', ');
          } else if (categoryInputType === InputType.NUMERIC) {
            displayValue = String(fv.values);
          } else if (categoryInputType === InputType.TEXT) {
            displayValue = String(fv.values);
          } else if (categoryInputType === InputType.BOOLEAN) {
            displayValue = fv.values ? 'Yes' : 'No';
          } else if (categoryInputType === InputType.UNITS) {
            displayValue = `${fv.values} ${fv.units || ''}`;
          } else if (categoryInputType === InputType.PRICES) {
            displayValue = `${fv.values}`;
          }
        }

        const featureValueDto: PropertyFeatureValueResponseDto = {
          ...fv,
          feature_group: featureGroup,
          feature_category: featureCategory,
          feature_options: featureOptionsData,
          display_value: displayValue
        };

        return featureValueDto;
      });
    }

    if (userId) {
      responseDto.is_user_favorite = !!(await this.favRepo.findOne({
        where: {
          entity_type: EntityType.PROPERTY,
          entity_id: responseDto.id,
          user_id: userId
        }
      }));
    }

    return responseDto;
  }

  private async getPropertyEnquiries(
    propertyId: string,
    userId: string,
    isDisplayAllRecords: boolean
  ): Promise<any[]> {
    const queryBuilder = this.enquiryRepo
      .createQueryBuilder('enquiry')
      .leftJoinAndSelect('enquiry.lead_statuses', 'lead_status')
      .leftJoinAndSelect('enquiry.user', 'enquiry_user')
      .where('enquiry.entity_type = :entityType', {
        entityType: EntityType.PROPERTY
      })
      .andWhere('enquiry.entity_id = :propertyId', { propertyId })
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

  async myProperties(agentId?: string, page = 1, limit = 0) {
    let condition: any = { is_active: true };
    if (agentId) {
      condition.agent_id = agentId;
    }

    const [data, total] = await this.propertyRepo.findAndCount({
      where: condition,
      order: { created_at: 'DESC' },
      ...(limit > 0 && { skip: (page - 1) * limit, take: limit }),
      relations: {
        media: true,
        property_category: true
      }
    });

    const dataWithExtras = data.map((property) => ({
      ...property,
      property_category_name: property.property_category?.name || null
    }));

    return {
      data: dataWithExtras,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total
    };
  }

  async create(
    dto: CreatePropertyDto,
    ownerId: string,
    options?: { createdByAdmin?: boolean }
  ) {
    const owner = await this.userRepo.findOne({ where: { id: ownerId } });
    if (!owner) {
      throw new NotFoundException('User not found');
    }

    if (dto.agent_id) {
      const companyProfile = await this.agentCompanyProfileRepo.findOne({
        where: { id: dto.agent_id }
      });
      if (!companyProfile) {
        throw new NotFoundException('Company profile not found');
      }
      if (companyProfile.userId !== ownerId) {
        throw new BadRequestException(
          'Company profile does not belong to the selected owner'
        );
      }
    }

    await this.applyCategoryFieldRules(dto, dto.property_category_id);
    const entity = this.propertyRepo.create(dto as any as Property);
    (entity as any).owner_id = ownerId;

    // Defaults for new optional fields
    (entity as any).project_status = (dto as any).project_status ?? 'CURRENT';
    (entity as any).offer = dto.offer?.trim() || null;

    // Super Admin posts are auto-approved and published immediately
    if (options?.createdByAdmin) {
      const now = new Date();
      (entity as any).approval_status = 'APPROVED';
      (entity as any).approved_at = now;
      (entity as any).is_published = true;
      (entity as any).published_at = now;
      (entity as any).is_verified = true;
    } else if (dto.is_published) {
      (entity as any).is_published = true;
      (entity as any).published_at = new Date();
    }

    if (dto.is_boosted && dto.boost_duration_days) {
      const boostExpiresAt = new Date();
      boostExpiresAt.setDate(
        boostExpiresAt.getDate() + dto.boost_duration_days
      );
      (entity as any).is_boosted = true;
      (entity as any).boost_expires_at = boostExpiresAt;
      (entity as any).boost_priority = dto.boost_priority || 1;
    }

    if (dto.is_top_listing && dto.top_listing_duration_days) {
      const topListingExpiresAt = new Date();
      topListingExpiresAt.setDate(
        topListingExpiresAt.getDate() + dto.top_listing_duration_days
      );
      (entity as any).is_top_listing = true;
      (entity as any).top_listing_expires_at = topListingExpiresAt;
    }

    const saved: Property = await this.propertyRepo.save(entity as any);

    if (dto.features?.length) {
      await this.replaceFeatures(saved.id, dto.features);
    }

    let user = owner;
    if (user && !user.roles.includes(UserType.AGENT)) {
      await this.userRepo.update(ownerId, {
        roles: [...user.roles, UserType.AGENT]
      });
    }
    await this.propertyIndexingService.indexProperty(saved.id);

    // Send property created notification to owner
    try {
      await this.notificationService.send({
        userId: ownerId,
        templateCode: 'PROPERTY_CREATED_AGENT',
        variables: {
          property_title: saved.title,
          property_id: saved.id,
          user_name:
            `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`.trim() ||
            user.firstName ||
            'User',
          user_email: user.email,
          phoneNumber: user.phoneNumber
        },
        entityType: NotificationEntityType.PROPERTY,
        entityId: saved.id
      });
    } catch (error) {
      // Log error but don't break the flow
      console.error('Failed to send property created notification', error);
    }

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdatePropertyDto) {
    const existing = await this.findOne(id);
    const categoryId = dto.property_category_id ?? existing.property_category_id;
    await this.applyCategoryFieldRules(dto, categoryId);
    await this.propertyRepo.update(id, {
      title: dto.title ?? existing.title,
      description: dto.description ?? existing.description,
      property_category_id:
        dto.property_category_id ?? existing.property_category_id,
      price: dto.price ?? existing.price,
      price_unit: dto.price_unit ?? existing.price_unit,
      property_size: dto.property_size ?? existing.property_size,
      property_size_unit: dto.property_size_unit ?? existing.property_size_unit,
      listing_type: dto.listing_type ?? existing.listing_type,
      status: dto.status ?? existing.status,
      offer:
        dto.offer !== undefined
          ? dto.offer?.trim() || null
          : (existing as any).offer,
      project_status: (dto as any).project_status ?? (existing as any).project_status,

      layout_price_min: (dto as any).layout_price_min ?? (existing as any).layout_price_min,
      layout_price_max: (dto as any).layout_price_max ?? (existing as any).layout_price_max,
      layout_area_min_sqft: (dto as any).layout_area_min_sqft ?? (existing as any).layout_area_min_sqft,
      layout_area_max_sqft: (dto as any).layout_area_max_sqft ?? (existing as any).layout_area_max_sqft,
      layout_area_unit: (dto as any).layout_area_unit ?? (existing as any).layout_area_unit,
      plot_total_count: (dto as any).plot_total_count ?? (existing as any).plot_total_count,
      plot_sold_count: (dto as any).plot_sold_count ?? (existing as any).plot_sold_count,
      plot_booked_count: (dto as any).plot_booked_count ?? (existing as any).plot_booked_count,
      plot_available_count: (dto as any).plot_available_count ?? (existing as any).plot_available_count,
      layout_total_sqft: (dto as any).layout_total_sqft ?? (existing as any).layout_total_sqft,

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
      agent_id: dto.agent_id ?? existing.agent_id,
      contact_name: dto.contact_name ?? existing.contact_name,
      contact_phone: dto.contact_phone ?? existing.contact_phone,
      contact_email: dto.contact_email ?? existing.contact_email,
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
        await this.propertyRepo.update(id, {
          is_boosted: true,
          boost_expires_at: boostExpiresAt,
          boost_priority: dto.boost_priority || existing.boost_priority || 1
        } as any);
      } else if (!dto.is_boosted) {
        await this.propertyRepo.update(id, {
          is_boosted: false,
          boost_expires_at: null,
          boost_priority: 0
        } as any);
      }
    }

    if (dto.is_top_listing !== undefined) {
      if (dto.is_top_listing && dto.top_listing_duration_days) {
        const topListingExpiresAt = new Date();
        topListingExpiresAt.setDate(
          topListingExpiresAt.getDate() + dto.top_listing_duration_days
        );
        await this.propertyRepo.update(id, {
          is_top_listing: true,
          top_listing_expires_at: topListingExpiresAt
        } as any);
      } else if (!dto.is_top_listing) {
        await this.propertyRepo.update(id, {
          is_top_listing: false,
          top_listing_expires_at: null
        } as any);
      }
    }

    if (dto.features) {
      await this.replaceFeatures(id, dto.features);
    }

    await this.propertyIndexingService.indexProperty(id);

    return this.findOne(id);
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.propertyRepo.delete(id);
    await this.propertyIndexingService.removeProperty(id);
    return { success: true };
  }

  async publish(id: string) {
    await this.propertyRepo.update(id, {
      is_published: true,
      published_at: new Date()
    } as any);

    await this.propertyIndexingService.updateProperty(id);
    return this.findOne(id);
  }

  async unpublish(id: string) {
    await this.propertyRepo.update(id, {
      is_published: false,
      published_at: null
    } as any);
    return this.findOne(id);
  }

  async replaceFeatures(
    propertyId: string,
    features: PropertyFeatureValueDto[]
  ) {
    await this.featureRepo.delete({ property_id: propertyId as any });

    const rows = (features || []).map((f) => {
      const valueString =
        f.value_text !== undefined && f.value_text !== null
          ? f.value_text
          : f.value_number !== undefined && f.value_number !== null
            ? String(f.value_number)
            : f.value_boolean !== undefined && f.value_boolean !== null
              ? String(f.value_boolean || String(f.value_boolean) === 'true')
              : undefined;

      return this.featureRepo.create({
        property_id: propertyId,
        feature_category_id: f.feature_category_id,
        feature_group_id: f.feature_group_id,
        feature_option_ids:
          f.option_ids ?? (f.option_id ? [f.option_id] : undefined),
        feature_option: f.option_id ? ({ id: f.option_id } as any) : undefined,
        values: valueString,
        is_verified: false
      } as any);
    });

    if (rows.length) {
      await this.featureRepo.save(rows as any);
    }
  }

  async boostProperty(
    id: string,
    boostDurationDays: number = 30,
    priority: number = 1
  ) {
    const boostExpiresAt = new Date();
    boostExpiresAt.setDate(boostExpiresAt.getDate() + boostDurationDays);

    await this.propertyRepo.update(id, {
      is_boosted: true,
      boost_expires_at: boostExpiresAt,
      boost_priority: priority
    } as any);

    return this.findOne(id);
  }

  async makeTopListing(id: string, topListingDurationDays: number = 7) {
    const topListingExpiresAt = new Date();
    topListingExpiresAt.setDate(
      topListingExpiresAt.getDate() + topListingDurationDays
    );

    await this.propertyRepo.update(id, {
      is_top_listing: true,
      top_listing_expires_at: topListingExpiresAt
    } as any);

    return this.findOne(id);
  }

  async removeBoost(id: string) {
    await this.propertyRepo.update(id, {
      is_boosted: false,
      boost_expires_at: null,
      boost_priority: 0
    } as any);

    return this.findOne(id);
  }

  async removeTopListing(id: string) {
    await this.propertyRepo.update(id, {
      is_top_listing: false,
      top_listing_expires_at: null
    } as any);

    return this.findOne(id);
  }

  async getBoostedProperties(page = 1, limit = 10) {
    const [data, total] = await this.propertyRepo.findAndCount({
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
      relations: {
        media: true,
        property_category: true
      }
    });

    const dataWithExtras = data.map((property) => ({
      ...property,
      property_category_name: property.property_category?.name || null
    }));

    return { data: dataWithExtras, total, page, limit };
  }

  async getTopListings(page = 1, limit = 10) {
    const [data, total] = await this.propertyRepo.findAndCount({
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
      relations: {
        media: true,
        property_category: true
      }
    });

    const dataWithExtras = data.map((property) => ({
      ...property,
      property_category_name: property.property_category?.name || null
    }));

    return {
      data: dataWithExtras,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total
    };
  }

  async findAllEnhanced(page = 1, limit = 10) {
    const [data, total] = await this.propertyRepo.findAndCount({
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
      relations: {
        media: true,
        property_category: true
      }
    });

    const dataWithExtras = data.map((property) => ({
      ...property,
      property_category_name: property.property_category?.name || null
    }));

    return { data: dataWithExtras, total, page, limit };
  }
  // Add to property.service.ts

  async updateStatus(id: string, status: string, note?: string) {
    const property = await this.propertyRepo.findOne({ where: { id } });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const updateData: any = { status };

    // If marked as SOLD or RENTED, update related fields
    if (status === PropertyStatus.SOLD || status === PropertyStatus.RENTED) {
      updateData.is_published = false;
      updateData.is_boosted = false;
      updateData.is_top_listing = false;
      updateData.boost_expires_at = null;
      updateData.top_listing_expires_at = null;
    }

    // If marked as AVAILABLE, allow re-publishing
    if (status === PropertyStatus.AVAILABLE) {
      updateData.is_active = true;
    }

    // If WITHDRAWN, deactivate
    if (status === PropertyStatus.WITHDRAWN) {
      updateData.is_active = false;
      updateData.is_published = false;
    }

    await this.propertyRepo.update(id, updateData);

    // Update Elasticsearch index
    await this.propertyIndexingService.updateProperty(id);

    return this.findOne(id);
  }

  private async recordPropertyView(
    propertyId: string,
    userId: string
  ): Promise<void> {
    try {
      const existingView = await this.entityViewRepo.findOne({
        where: {
          user_id: userId,
          entity_type: 'PROPERTY',
          entity_id: propertyId
        }
      });

      if (existingView) {
        // Same user revisiting — update last seen only; do NOT bump property insights count
        await this.entityViewRepo.update(existingView.id, {
          last_viewed_at: new Date()
        });
        return;
      }

      const newView = this.entityViewRepo.create({
        user_id: userId,
        entity_type: 'PROPERTY',
        entity_id: propertyId,
        view_count: 1,
        last_viewed_at: new Date()
      });
      await this.entityViewRepo.save(newView);

      // Unique viewer: increment public page-views once per user
      await this.propertyRepo.increment({ id: propertyId }, 'view_count', 1);
      await this.propertyIndexingService.updateProperty(propertyId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to record view:', message);
    }
  }
}
