import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Newsletter } from '../entities/newsletter.entity';
import { User } from '../../users/entities/user.entity';
import { CreateNewsletterDto } from '../dto/create-newsletter.dto';
import { NewsletterResponseDto } from '../dto/newsletter-response.dto';

@Injectable()
export class NewsletterService {
  constructor(
    @InjectRepository(Newsletter)
    private readonly newsletterRepo: Repository<Newsletter>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>
  ) {}

  async getAll(
    page: number = 1,
    limit: number = 10,
    sort: 'ASC' | 'DESC' = 'DESC',
    orderBy: string = 'created_at',
    search?: string
  ): Promise<{
    data: NewsletterResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skipCount = (page - 1) * limit;
    const queryBuilder = this.newsletterRepo.createQueryBuilder('newsletter');

    // Add search filter if provided
    if (search) {
      queryBuilder.where('newsletter.email ILIKE :search', { search: `%${search}%` });
    }

    // Add sorting
    const validOrderBy = ['email', 'created_at', 'subscription_status', 'city', 'state', 'country'];
    const orderByField = validOrderBy.includes(orderBy) ? orderBy : 'created_at';
    queryBuilder.orderBy(`newsletter.${orderByField}`, sort);

    // Add pagination
    queryBuilder.skip(skipCount).take(limit);

    const [newsletters, total] = await queryBuilder.getManyAndCount();

    const data = newsletters.map(newsletter => this.mapToResponseDto(newsletter));

    return { data, total, page, limit };
  }

  async create(
    dto: CreateNewsletterDto,
    ipAddress?: string,
    city?: string,
    state?: string,
    country?: string
  ): Promise<NewsletterResponseDto> {
    // Check if email already exists in newsletter table
    const existingNewsletter = await this.newsletterRepo.findOne({
      where: { email: dto.email }
    });

    if (existingNewsletter) {
      throw new ConflictException('Already subscribed');
    }

    // Check if email exists in users table
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email }
    });

    const newsletterData: Partial<Newsletter> = {
      email: dto.email,
      ip_address: ipAddress || null,
      city: city || null,
      state: state || null,
      country: country || null,
      subscription_status: true,
      isPlatformUser: !!existingUser,
      platformUserId: existingUser?.id || null
    };

    const newsletter = this.newsletterRepo.create(newsletterData);
    const saved = await this.newsletterRepo.save(newsletter);
    return this.mapToResponseDto(saved);
  }

  async unsubscribeNewsLetter(id: string): Promise<NewsletterResponseDto> {
    const newsletter = await this.newsletterRepo.findOne({
      where: { id }
    });

    if (!newsletter) {
      throw new NotFoundException('Newsletter subscription not found');
    }

    if (!newsletter.subscription_status) {
      throw new BadRequestException('Already unsubscribed');
    }

    newsletter.subscription_status = false;
    const updated = await this.newsletterRepo.save(newsletter);
    return this.mapToResponseDto(updated);
  }

  async subscribeNewsLetter(id: string): Promise<NewsletterResponseDto> {
    const newsletter = await this.newsletterRepo.findOne({
      where: { id }
    });

    if (!newsletter) {
      throw new NotFoundException('Newsletter subscription not found');
    }

    if (newsletter.subscription_status) {
      throw new BadRequestException('Already subscribed');
    }

    newsletter.subscription_status = true;
    const updated = await this.newsletterRepo.save(newsletter);
    return this.mapToResponseDto(updated);
  }

  async getAnalytics(): Promise<{
    grandTotal: number;
    today: { count: number; growthPercentage: number };
    thisWeek: { count: number; growthPercentage: number };
    thisMonth: { count: number; growthPercentage: number };
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Previous periods for growth calculation
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);

    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Grand total (all time)
    const grandTotal = await this.newsletterRepo.count();

    // Today's count
    const todayCount = await this.newsletterRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :todayStart', { todayStart })
      .getCount();

    // Yesterday's count (for growth calculation)
    const yesterdayCount = await this.newsletterRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :yesterdayStart', { yesterdayStart })
      .andWhere('n.created_at < :yesterdayEnd', { yesterdayEnd })
      .getCount();

    // This week's count
    const thisWeekCount = await this.newsletterRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :weekStart', { weekStart })
      .getCount();

    // Last week's count (for growth calculation)
    const lastWeekCount = await this.newsletterRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :lastWeekStart', { lastWeekStart })
      .andWhere('n.created_at < :lastWeekEnd', { lastWeekEnd })
      .getCount();

    // This month's count
    const thisMonthCount = await this.newsletterRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :monthStart', { monthStart })
      .getCount();

    // Last month's count (for growth calculation)
    const lastMonthCount = await this.newsletterRepo
      .createQueryBuilder('n')
      .where('n.created_at >= :lastMonthStart', { lastMonthStart })
      .andWhere('n.created_at <= :lastMonthEnd', { lastMonthEnd })
      .getCount();

    // Calculate growth percentages
    const calculateGrowth = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      grandTotal,
      today: {
        count: todayCount,
        growthPercentage: calculateGrowth(todayCount, yesterdayCount),
      },
      thisWeek: {
        count: thisWeekCount,
        growthPercentage: calculateGrowth(thisWeekCount, lastWeekCount),
      },
      thisMonth: {
        count: thisMonthCount,
        growthPercentage: calculateGrowth(thisMonthCount, lastMonthCount),
      },
    };
  }

  private mapToResponseDto(newsletter: Newsletter): NewsletterResponseDto {
    return {
      id: newsletter.id,
      email: newsletter.email,
      ip_address: newsletter.ip_address,
      city: newsletter.city,
      state: newsletter.state,
      country: newsletter.country,
      subscription_status: newsletter.subscription_status,
      isPlatformUser: newsletter.isPlatformUser,
      platformUserId: newsletter.platformUserId,
      created_at: newsletter.created_at,
      updated_at: newsletter.updated_at,
    };
  }
}

