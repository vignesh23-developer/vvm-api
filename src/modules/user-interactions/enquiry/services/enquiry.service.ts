import {
  Injectable,
  NotFoundException,
  ForbiddenException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Enquiry } from '../../entities/enquiry.entity';
import { CreateEnquiryDto } from '../dto';
import { EntityType } from '../../../search/saved-search/dto';
import { Property } from '../../../property/entities/properties.entity';
import { Ad } from '../../../ads/entities/ad.entity';
import { PropertyIndexingService } from '../../../search';
import { AdIndexingService } from '../../../search/services/ad-indexing.service';
import { UserType } from '../../../users/enums/usertype';
import { NotificationService } from '../../../notification/services/notification.service';
import { NotificationEntityType } from '../../../notification/enums/notification.enum';
import { User } from '../../../users/entities/user.entity';

interface ListFilters {
  page?: number;
  limit?: number;
  entityType?: EntityType;
  entityId?: string;
  status?: string;
  filterByRole?: boolean;
}

interface CurrentUserType {
  id: string;
  roles: UserType[];
}

@Injectable()
export class EnquiryService {
  constructor(
    @InjectRepository(Enquiry)
    private readonly enquiryRepository: Repository<Enquiry>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Ad)
    private readonly adsRepository: Repository<Ad>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly propertyIndexingService: PropertyIndexingService,
    private readonly adIndexingService: AdIndexingService,
    private readonly notificationService: NotificationService
  ) {}

  async create(dto: CreateEnquiryDto, userId?: string) {
    const enquiry = this.enquiryRepository.create({
      ...dto,
      user_id: userId,
      status: 'new'
    });

    const saved = await this.enquiryRepository.save(enquiry);

    if (dto.entity_type === EntityType.PROPERTY) {
      await this.propertyRepository.increment(
        { id: dto.entity_id },
        'contact_count',
        1
      );
      await this.propertyIndexingService.updateProperty(dto.entity_id);

      // Send enquiry received notification to property owner (seller)
      try {
        const property = await this.propertyRepository.findOne({
          where: { id: dto.entity_id },
          select: ['id', 'title', 'owner_id']
        });

        if (property && property.owner_id) {
          // Get buyer details
          let buyer_name = dto.name;
          let buyer_phone = dto.phone || '';
          let buyer_email = dto.email || '';

          if (userId) {
            const buyer = await this.userRepo.findOne({
              where: { id: userId },
              select: ['id', 'firstName', 'lastName', 'phoneNumber', 'email']
            });
            if (buyer) {
              buyer_name =
                `${buyer.firstName}${buyer.lastName ? ` ${buyer.lastName}` : ''}`.trim() ||
                buyer.firstName ||
                dto.name;
              buyer_phone = buyer.phoneNumber || dto.phone || '';
              buyer_email = buyer.email || dto.email || '';
            }
          }

          const enquiry_url = `/leads/${saved.id}`;

          await this.notificationService.send({
            userId: property.owner_id,
            templateCode: 'ENQUIRY_RECEIVED',
            variables: {
              user_name: buyer_name,
              user_email: buyer_email,
              phoneNumber: buyer_phone,
              property_title: property.title,
              property_id: dto.entity_id,
              message: dto.message,
              enquiry_id: saved.id,
              enquiry_url
            },
            entityType: NotificationEntityType.ENQUIRY,
            entityId: saved.id
          });
        }
      } catch (error) {
        // Log error but don't break the flow
        console.error('Failed to send enquiry received notification', error);
      }
    } else if (dto.entity_type === EntityType.AD) {
      await this.adsRepository.increment(
        { id: dto.entity_id },
        'contact_count',
        1
      );
      await this.adIndexingService.updateAd(dto.entity_id);
    }
    return saved;
  }

  // UPDATED: Backward compatible with optional role filtering
  async findAll(filters: ListFilters, currentUser?: CurrentUserType) {
    const {
      page = 1,
      limit = 10,
      entityType,
      entityId,
      status,
      filterByRole = false
    } = filters;

    const queryBuilder = this.enquiryRepository
      .createQueryBuilder('enquiry')
      .leftJoinAndSelect('enquiry.user', 'user')
      .orderBy('enquiry.created_at', 'DESC');

    if (currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
      if (!isAdmin) {
        queryBuilder.andWhere(
          `(
            (enquiry.entity_type = 'property' AND enquiry.entity_id IN (
              SELECT p.id FROM properties p WHERE p.owner_id = :userId 
            ))
            OR
            (enquiry.entity_type = 'ad' AND enquiry.entity_id IN (
              SELECT a.id FROM ads a WHERE a.owner_id = :userId
            ))
          )`,
          { userId: currentUser.id }
        );
      }
    }

    // Filter by entity type
    if (entityType) {
      queryBuilder.andWhere('enquiry.entity_type = :entityType', {
        entityType
      });
    }

    // Filter by specific entity
    if (entityId) {
      queryBuilder.andWhere('enquiry.entity_id = :entityId', { entityId });
    }

    // Filter by status
    if (status) {
      queryBuilder.andWhere('enquiry.status = :status', { status });
    }

    // Handle pagination - if limit is 0, return all records
    if (limit === 0) {
      const data = await queryBuilder.getMany();
      return {
        data,
        total: data.length,
        page: 1,
        limit: 0,
        totalPages: 1
      };
    }

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    const enrichedData = await this.enrichEnquiriesWithEntityDetails(data);

    return {
      data: enrichedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // UPDATED: Backward compatible findOne with optional access check
  async findOne(
    id: string,
    currentUser?: CurrentUserType,
    checkAccess = false
  ) {
    const enquiry = await this.enquiryRepository.findOne({
      where: { id },
      relations: { user: true }
    });

    if (!enquiry) {
      throw new NotFoundException('Enquiry not found');
    }

    // Access check (only when checkAccess=true)
    if (checkAccess && currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);

      if (!isAdmin) {
        // User can see their own enquiries
        if (enquiry.user_id === currentUser.id) {
          return enquiry;
        }

        // Agent can see enquiries on their properties/ads
        const hasAccess = await this.checkEntityAccess(
          enquiry.entity_type as EntityType,
          enquiry.entity_id,
          currentUser.id
        );

        if (!hasAccess) {
          throw new ForbiddenException(
            'You do not have access to this enquiry'
          );
        }
      }
    }

    return enquiry;
  }

  // UPDATED: Backward compatible updateStatus with optional access check
  async updateStatus(
    id: string,
    status: string,
    currentUser?: CurrentUserType,
    checkAccess = false
  ) {
    const enquiry = await this.enquiryRepository.findOne({ where: { id } });

    if (!enquiry) {
      throw new NotFoundException('Enquiry not found');
    }

    // Access check (only when checkAccess=true)
    if (checkAccess && currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);

      if (!isAdmin) {
        const hasAccess = await this.checkEntityAccess(
          enquiry.entity_type as EntityType,
          enquiry.entity_id,
          currentUser.id
        );

        if (!hasAccess) {
          throw new ForbiddenException(
            'You do not have permission to update this enquiry'
          );
        }
      }
    }

    await this.enquiryRepository.update(id, { status });
    return this.enquiryRepository.findOne({
      where: { id },
      relations: { user: true }
    });
  }

  // UPDATED: Backward compatible findByEntity with optional access check
  async findByEntity(
    entityType: EntityType,
    entityId: string,
    page: number,
    limit: number,
    currentUser?: CurrentUserType,
    checkAccess = false
  ) {
    // Access check (only when checkAccess=true)
    if (checkAccess && currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
      if (!isAdmin) {
        const hasAccess = await this.checkEntityAccess(
          entityType,
          entityId,
          currentUser.id
        );
        if (!hasAccess) {
          throw new ForbiddenException(
            "You do not have access to this entity's enquiries"
          );
        }
      }
    }

    return this.findAll({ page, limit, entityType, entityId }, currentUser);
  }

  async findByUser(
    userId: string,
    page: number,
    limit: number,
    entityType?: EntityType
  ) {
    const queryBuilder = this.enquiryRepository
      .createQueryBuilder('enquiry')
      .leftJoinAndSelect('enquiry.user', 'user')
      .where('enquiry.user_id = :userId', { userId })
      .orderBy('enquiry.created_at', 'DESC');

    if (entityType) {
      queryBuilder.andWhere('enquiry.entity_type = :entityType', {
        entityType
      });
    }

    // Handle limit = 0
    if (limit === 0) {
      const data = await queryBuilder.getMany();
      return {
        data,
        total: data.length,
        page: 1,
        limit: 0,
        totalPages: 1
      };
    }

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    const enrichedData = await this.enrichEnquiriesWithEntityDetails(data);
    return {
      data: enrichedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  private async enrichEnquiriesWithEntityDetails(enquiries: Enquiry[]) {
    if (!enquiries.length) return enquiries;

    const propertyIds = enquiries
      .filter((e) => e.entity_type === EntityType.PROPERTY)
      .map((e) => e.entity_id);
    const adIds = enquiries
      .filter((e) => e.entity_type === EntityType.AD)
      .map((e) => e.entity_id);

    const [properties, ads] = await Promise.all([
      propertyIds.length
        ? this.propertyRepository.find({
            where: { id: In(propertyIds) },
            select: [
              'id',
              'title',
              'city',
              'district',
              'state',
              'price',
              'listing_type'
            ]
          })
        : [],
      adIds.length
        ? this.adsRepository.find({
            where: { id: In(adIds) },
            select: ['id', 'title', 'city', 'district', 'state', 'price']
          })
        : []
    ]);

    const propertyMap = new Map<string, any>(
      properties.map((p) => [p.id, p] as [string, any])
    );
    const adMap = new Map<string, any>(
      ads.map((a) => [a.id, a] as [string, any])
    );

    return enquiries.map((enquiry) => ({
      ...enquiry,
      property:
        enquiry.entity_type === EntityType.PROPERTY
          ? propertyMap.get(enquiry.entity_id) || null
          : null,
      ad:
        enquiry.entity_type === EntityType.AD
          ? adMap.get(enquiry.entity_id) || null
          : null
    }));
  }

  // NEW: Get stats with optional role filtering
  async getStats(currentUser?: CurrentUserType, filterByRole = false) {
    const isAdmin =
      !filterByRole ||
      !currentUser ||
      currentUser.roles?.includes(UserType.ADMIN);

    let whereClause = '1=1';
    let params: any = {};

    if (!isAdmin && currentUser) {
      whereClause = `(
        (enquiry.entity_type = 'property' AND enquiry.entity_id IN (
          SELECT p.id FROM properties p WHERE p.owner_id = :userId OR p.agent_id = :userId
        ))
        OR
        (enquiry.entity_type = 'ad' AND enquiry.entity_id IN (
          SELECT a.id FROM ads a WHERE a.owner_id = :userId
        ))
      )`;
      params = { userId: currentUser.id };
    }

    // Count by status
    const statusCounts = await this.enquiryRepository
      .createQueryBuilder('enquiry')
      .select('enquiry.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where(whereClause, params)
      .groupBy('enquiry.status')
      .getRawMany();

    // Count by entity type
    const typeCounts = await this.enquiryRepository
      .createQueryBuilder('enquiry')
      .select('enquiry.entity_type', 'entity_type')
      .addSelect('COUNT(*)', 'count')
      .where(whereClause, params)
      .groupBy('enquiry.entity_type')
      .getRawMany();

    // Total count
    const total = await this.enquiryRepository
      .createQueryBuilder('enquiry')
      .where(whereClause, params)
      .getCount();

    // New enquiries (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newEnquiries = await this.enquiryRepository
      .createQueryBuilder('enquiry')
      .where('enquiry.created_at >= :sevenDaysAgo', { sevenDaysAgo })
      .andWhere(whereClause, params)
      .getCount();

    return {
      total,
      newEnquiries,
      by_status: statusCounts,
      by_entity_type: typeCounts
    };
  }

  // NEW: Get my received enquiries (for agent dashboard)
  async getMyReceivedEnquiries(
    userId: string,
    filters: Omit<ListFilters, 'filterByRole'>
  ) {
    const { page = 1, limit = 10, entityType, status } = filters;

    const queryBuilder = this.enquiryRepository
      .createQueryBuilder('enquiry')
      .leftJoinAndSelect('enquiry.user', 'user')
      .where(
        `(
          (enquiry.entity_type = 'property' AND enquiry.entity_id IN (
            SELECT p.id FROM properties p WHERE p.owner_id = :userId OR p.agent_id = :userId
          ))
          OR
          (enquiry.entity_type = 'ad' AND enquiry.entity_id IN (
            SELECT a.id FROM ads a WHERE a.owner_id = :userId
          ))
        )`,
        { userId }
      )
      .orderBy('enquiry.created_at', 'DESC');

    if (entityType) {
      queryBuilder.andWhere('enquiry.entity_type = :entityType', {
        entityType
      });
    }

    if (status) {
      queryBuilder.andWhere('enquiry.status = :status', { status });
    }

    // Handle limit = 0
    if (limit === 0) {
      const data = await queryBuilder.getMany();
      return { data, total: data.length, page: 1, limit: 0, totalPages: 1 };
    }

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Helper method to check entity access
  private async checkEntityAccess(
    entityType: EntityType,
    entityId: string,
    userId: string
  ): Promise<boolean> {
    if (entityType === EntityType.PROPERTY) {
      const property = await this.propertyRepository.findOne({
        where: { id: entityId },
        select: ['id', 'owner_id', 'agent_id']
      });
      return property?.owner_id === userId || property?.agent_id === userId;
    } else if (entityType === EntityType.AD) {
      const ad = await this.adsRepository.findOne({
        where: { id: entityId },
        select: ['id', 'owner_id']
      });
      return ad?.owner_id === userId;
    }
    return false;
  }
}
