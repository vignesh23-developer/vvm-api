import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../../property/entities/properties.entity';
import { Ad } from '../../ads/entities/ad.entity';
import { Review } from '../../reviews';
import { PropertyCategory } from '../../master/entities/property-category.entity';
import { HomeQueryDto } from '../dto/home-query.dto';
import { User } from '../../users';
import { Enquiry } from '../../user-interactions/entities/enquiry.entity';

@Injectable()
export class HomeService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(PropertyCategory)
    private readonly propertyCategoryRepo: Repository<PropertyCategory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Enquiry)
    private readonly enquiryRepository?: Repository<Enquiry>,
  ) {}

  /**
   * Get all home page data in a single API call
   */
  async getHomePageData(query: HomeQueryDto) {
    const [
      featuredProperties,
      featuredAds,
      districtSummary,
      testimonials,
      propertyCategories,
      stats
    ] = await Promise.all([
      this.getFeaturedProperties(query.properties_limit || 8),
      this.getFeaturedAds(query.ads_limit || 6),
      this.getDistrictSummary(query.districts_limit || 10),
      this.getTestimonials(query.reviews_limit || 5),
      this.getPropertyCategories(),
      this.getStats()
    ]);

    return {
      featuredProperties,
      featuredAds,
      districtSummary,
      testimonials,
      propertyCategories,
      stats
    };
  }

  /**
   * Get featured properties ordered by priority:
   * top_listing > boosted > boost_priority > premium > featured > views > recent
   */
  private async getFeaturedProperties(limit: number) {
    const data = await this.propertyRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.media', 'media')
      .leftJoinAndSelect('p.property_category', 'pc')
      .where('p.is_active = :active', { active: true })
      .andWhere('p.is_published = :published', { published: true })
      .andWhere('p.approval_status = :approved', { approved: 'APPROVED' })
      .orderBy('p.is_top_listing', 'DESC')
      .addOrderBy('p.is_boosted', 'DESC')
      .addOrderBy('p.created_at', 'DESC')
      .addOrderBy('p.boost_priority', 'DESC')
      .addOrderBy('p.is_premium', 'DESC')
      .addOrderBy('p.is_featured', 'DESC')
      .addOrderBy('p.view_count', 'DESC')
      .take(limit)
      .getMany();

    // Map to include property_category_name (same as existing property list response)
    const mappedData = data.map((property) => ({
      ...property,
      property_category_name: property.property_category?.name || null
    }));

    return {
      data: mappedData,
      total: mappedData.length
    };
  }

  /**
   * Get featured ads ordered by priority:
   * top_listing > boosted > boost_priority > premium > featured > views > recent
   * Also filters out expired ads
   */
  private async getFeaturedAds(limit: number) {
    const now = new Date();

    const data = await this.adRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.images', 'images')
      .leftJoinAndSelect('a.category', 'category')
      .where('a.is_active = :active', { active: true })
      .andWhere('a.is_published = :published', { published: true })
      .andWhere('a.approval_status = :approved', { approved: 'APPROVED' })
      .andWhere('(a.expires_at IS NULL OR a.expires_at > :now)', { now })
      .orderBy('a.is_top_listing', 'DESC')
      .addOrderBy('a.is_boosted', 'DESC')
      .addOrderBy('a.boost_priority', 'DESC')
      .addOrderBy('a.is_premium', 'DESC')
      .addOrderBy('a.is_featured', 'DESC')
      .addOrderBy('a.view_count', 'DESC')
      .addOrderBy('a.created_at', 'DESC')
      .take(limit)
      .getMany();

    // Map to include category_name (same as existing ad list response)
    const mappedData = data.map((ad) => ({
      ...ad,
      category_name: ad.category?.name || null
    }));

    return {
      data: mappedData,
      total: mappedData.length
    };
  }

  private async getDistrictSummary(limit: number) {
    const normalizedDistrictExpr = 'LOWER(TRIM(p.district))';
    const displayDistrictExpr = 'INITCAP(TRIM(p.district))';

    // Main query for district summary
    const result = await this.propertyRepo
      .createQueryBuilder('p')
      .select(displayDistrictExpr, 'district')
      .addSelect('COUNT(p.id)', 'count')
      .addSelect('MIN(p.price)', 'min_price')
      .addSelect('MAX(p.price)', 'max_price')
      .addSelect('COUNT(DISTINCT p.agent_id)', 'no_of_agents')
      .where('p.is_active = :active', { active: true })
      .andWhere('p.approval_status = :approved', { approved: 'APPROVED' })
      .andWhere('p.is_published = :published', { published: true })
      .andWhere('p.district IS NOT NULL')
      .andWhere("TRIM(p.district) != ''")
      .groupBy(normalizedDistrictExpr)
      .addGroupBy(displayDistrictExpr)
      .orderBy('COUNT(p.id)', 'DESC')
      .limit(limit)
      .getRawMany();

    if (result.length === 0) {
      return [];
    }

    // Get normalized district keys for category lookup
    const districtKeys = result.map((r) => r.district.toLowerCase());

    const categoryResult = await this.propertyRepo
      .createQueryBuilder('p')
      .select(normalizedDistrictExpr, 'district_key')
      .addSelect('pc.name', 'category_name')
      .innerJoin('p.property_category', 'pc')
      .where('p.is_active = :active', { active: true })
      .andWhere('p.approval_status = :approved', { approved: 'APPROVED' })
      .andWhere('p.is_published = :published', { published: true })
      .andWhere(`${normalizedDistrictExpr} IN (:...districtKeys)`, {
        districtKeys
      })
      .groupBy(normalizedDistrictExpr)
      .addGroupBy('pc.name')
      .getRawMany();

    // Group categories by normalized district key
    const categoryMap: Record<string, string[]> = {};
    categoryResult.forEach((row) => {
      const key = row.district_key;
      if (!categoryMap[key]) {
        categoryMap[key] = [];
      }
      if (row.category_name && !categoryMap[key].includes(row.category_name)) {
        categoryMap[key].push(row.category_name);
      }
    });

    return result.map((row) => ({
      district: row.district,
      count: Number(row.count),
      minAmount: Number(row.min_price),
      maxAmount: Number(row.max_price),
      noOfAgents: Number(row.no_of_agents) || 0,
      propertyCategories: categoryMap[row.district.toLowerCase()] || []
    }));
  }

  /**
   * Get testimonials - recent active reviews
   * Same structure as existing reviews list response
   */
  private async getTestimonials(limit: number) {
    const [reviews, total] = await this.reviewRepo.findAndCount({
      where: { is_active: true },
      relations: ['user'],
      order: { created_at: 'DESC' },
      take: limit
    });

    // Calculate average rating across all reviews
    const avgResult = await this.reviewRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('r.is_active = :active', { active: true })
      .getRawOne();

    // Map to same structure as existing review response
    const data = reviews.map((review) => ({
      id: review.id,
      user_id: review.user_id,
      user_firstName: review.user?.firstName || null,
      user_lastName: review.user?.lastName || null,
      user_email: review.user?.email || null,
      comment: review.comment,
      rating: review.rating,
      is_active: review.is_active,
      helpful_count: review.helpful_count,
      created_at: review.created_at,
      updated_at: review.updated_at
    }));

    return {
      data,
      total: Number(avgResult?.count || 0),
      averageRating: Number(Number(avgResult?.avg || 0).toFixed(1))
    };
  }

  /**
   * Get property categories with property counts
   * Only returns parent categories (not children)
   */
  private async getPropertyCategories() {
    // Query categories with property counts
    const rawResults = await this.propertyCategoryRepo
      .createQueryBuilder('pc')
      .leftJoin(
        'pc.properties',
        'p',
        'p.is_active = :active AND p.is_published = :published AND p.approval_status = :approved',
        { active: true, published: true, approved: 'APPROVED' }
      )
      .select([
        'pc.id AS id',
        'pc.name AS name',
        'pc.description AS description',
        'pc.icon AS icon',
        'pc.sort_order AS sort_order',
        'COUNT(p.id) AS property_count'
      ])
      .where('pc.is_active = :categoryActive', { categoryActive: true })
      .andWhere('pc.parent_id IS NULL') // Only parent categories
      .groupBy('pc.id')
      .addGroupBy('pc.name')
      .addGroupBy('pc.description')
      .addGroupBy('pc.icon')
      .addGroupBy('pc.sort_order')
      .orderBy('pc.sort_order', 'ASC')
      .addOrderBy('pc.name', 'ASC')
      .getRawMany();

    return rawResults.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      count: Number(row.property_count || 0)
    }));
  }

  async getStats(): Promise<any> {
    const [
      totalProperties,
      verifiedProperties,
      totalAgents,
      kycVerifiedAgents,
      totalDistricts,
      totalAds,
      totalUsers,
      totalEnquiries,
    ] = await Promise.all([
      // Total published & approved properties
      this.propertyRepo.count({
        where: {
          is_published: true,
          approval_status: 'APPROVED',
          is_active: true,
        },
      }),

      // Verified properties
      this.propertyRepo.count({
        where: {
          is_published: true,
          approval_status: 'APPROVED',
          is_active: true,
          is_verified: true,
        },
      }),

      // Total agents (users who have posted at least one property)
      this.propertyRepo
        .createQueryBuilder('property')
        .select('COUNT(DISTINCT property.owner_id)', 'count')
        .where('property.is_published = :published', { published: true })
        .andWhere('property.approval_status = :status', { status: 'APPROVED' })
        .andWhere('property.is_active = :active', { active: true })
        .getRawOne()
        .then((result) => parseInt(result?.count || '0', 10)),

      // KYC verified agents (users with isKycVerified = true who have properties)
      this.userRepository
        .createQueryBuilder('user')
        .innerJoin('properties', 'property', 'property.owner_id = user.id')
        .where('user.isKycVerified = :verified', { verified: true })
        .andWhere('property.is_published = :published', { published: true })
        .andWhere('property.approval_status = :status', { status: 'APPROVED' })
        .andWhere('property.is_active = :active', { active: true })
        .select('COUNT(DISTINCT user.id)', 'count')
        .getRawOne()
        .then((result) => parseInt(result?.count || '0', 10)),

      // Total unique districts with properties
      this.propertyRepo
        .createQueryBuilder('property')
        .select('COUNT(DISTINCT property.district)', 'count')
        .where('property.is_published = :published', { published: true })
        .andWhere('property.approval_status = :status', { status: 'APPROVED' })
        .andWhere('property.is_active = :active', { active: true })
        .andWhere('property.district IS NOT NULL')
        .andWhere("property.district != ''")
        .getRawOne()
        .then((result) => parseInt(result?.count || '0', 10)),

      // Total published ads
      this.adRepo.count({
        where: {
          is_published: true,
          approval_status: 'APPROVED',
          is_active: true,
        },
      }),

      // Total registered users
      this.userRepository.count(),

      // Total enquiries (if you have enquiries table)
      this.enquiryRepository ? this.enquiryRepository.count() : Promise.resolve(0),
    ]);

    return {
      totalProperties,
      verifiedProperties,
      totalAgents,
      kycVerifiedAgents,
      totalDistricts,
      totalAds,
      totalUsers,
      totalEnquiries,
    };
  }

}
