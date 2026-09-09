import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdReport } from '../../entities/ad-report.entity';
import { Ad } from '../../entities/ad.entity';
import { CreateAdReportDto } from '../dto/create-report.dto';
import { UserType } from '../../../users/enums/usertype';

interface ListFilters {
  page?: number;
  limit?: number;
  status?: string;
  adId?: string;
  reportType?: string;
  severity?: number;
  filterByRole?: boolean; // NEW: Enable role-based filtering
}

interface CurrentUserType {
  id: string;
  roles: UserType[];
}

@Injectable()
export class AdReportService {
  constructor(
    @InjectRepository(AdReport) private readonly reportRepo: Repository<AdReport>,
    @InjectRepository(Ad) private readonly adRepo: Repository<Ad>,
  ) {}

  async create(adId: string, dto: CreateAdReportDto, reporterId?: string) {
    const ad = await this.adRepo.findOne({ where: { id: adId } });
    if (!ad) throw new NotFoundException('Ad not found');

    // Prevent users from reporting their own ads
    if (reporterId && ad.owner_id === reporterId) {
      throw new BadRequestException('You cannot report your own ad');
    }

    const created = this.reportRepo.create({
      ad_id: adId,
      report_type: dto.report_type,
      description: dto.description,
      status: 'PENDING',
      evidence: dto.evidence,
      is_anonymous: !!dto.is_anonymous,
      severity: dto.severity ?? 1,
      reporter_id: dto.reporter_id ?? reporterId,
    } as any);
    return this.reportRepo.save(created);
  }

  // UPDATED: Backward compatible with optional role filtering
  async list(filters: ListFilters, currentUser?: CurrentUserType) {
    const { page = 1, limit = 10, status, adId, reportType, severity, filterByRole = false } = filters;

    const queryBuilder = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.ad', 'ad')
      .orderBy('report.created_at', 'DESC');

    // NEW: Role-based filtering (only when filterByRole=true)
    if (currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
      if (!isAdmin) {
        // Agent can only see reports on their own ads
        queryBuilder.andWhere('ad.owner_id = :userId', { userId: currentUser.id });
      }
    }

    // Filter by status
    if (status) {
      queryBuilder.andWhere('report.status = :status', { status });
    }

    // Filter by specific ad
    if (adId) {
      queryBuilder.andWhere('report.ad_id = :adId', { adId });
    }

    // Filter by report type
    if (reportType) {
      queryBuilder.andWhere('report.report_type = :reportType', { reportType });
    }

    // Filter by severity
    if (severity) {
      queryBuilder.andWhere('report.severity = :severity', { severity });
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

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // UPDATED: Backward compatible get with optional access check
  async get(id: string, currentUser?: CurrentUserType, checkAccess = false) {
    const report = await this.reportRepo.findOne({
      where: { id },
      relations: { ad: true }
    });

    if (!report) throw new NotFoundException('Report not found');

    // NEW: Access check (only when checkAccess=true)
    if (checkAccess && currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
      if (!isAdmin && report.ad?.owner_id !== currentUser.id) {
        throw new ForbiddenException('You do not have access to this report');
      }
    }

    return report;
  }

  // UPDATED: Backward compatible resolve with optional admin check
  async resolve(
    id: string,
    reviewerId: string | undefined,
    resolution_notes?: string,
    resolution_action?: string,
    currentUser?: CurrentUserType,
    checkAdmin = false
  ) {
    // NEW: Admin check (only when checkAdmin=true)
    if (checkAdmin && currentUser && !currentUser.roles?.includes(UserType.ADMIN)) {
      throw new ForbiddenException('Only admin can resolve reports');
    }

    await this.ensureExists(id);
    await this.reportRepo.update(id, {
      status: 'RESOLVED',
      reviewer_id: reviewerId,
      resolution_notes,
      resolution_action,
      resolved_at: new Date(),
    } as any);
    return this.reportRepo.findOne({ where: { id }, relations: { ad: true } });
  }

  // UPDATED: Backward compatible dismiss with optional admin check
  async dismiss(
    id: string,
    reviewerId: string | undefined,
    resolution_notes?: string,
    currentUser?: CurrentUserType,
    checkAdmin = false
  ) {
    // NEW: Admin check (only when checkAdmin=true)
    if (checkAdmin && currentUser && !currentUser.roles?.includes(UserType.ADMIN)) {
      throw new ForbiddenException('Only admin can dismiss reports');
    }

    await this.ensureExists(id);
    await this.reportRepo.update(id, {
      status: 'DISMISSED',
      reviewer_id: reviewerId,
      resolution_notes,
      resolved_at: new Date(),
    } as any);
    return this.reportRepo.findOne({ where: { id }, relations: { ad: true } });
  }

  // UPDATED: Backward compatible stats with optional role filtering
  async stats(currentUser?: CurrentUserType, filterByRole = false) {
    const isAdmin = !filterByRole || !currentUser || currentUser.roles?.includes(UserType.ADMIN);

    const whereClause = isAdmin ? '1=1' : 'ad.owner_id = :userId';
    const params = isAdmin ? {} : { userId: currentUser.id };

    // Count by status
    const byStatus = await this.reportRepo
      .createQueryBuilder('report')
      .select('report.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('report.ad', 'ad')
      .where(whereClause, params)
      .groupBy('report.status')
      .getRawMany();

    // Count by type
    const byType = await this.reportRepo
      .createQueryBuilder('report')
      .select('report.report_type', 'report_type')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('report.ad', 'ad')
      .where(whereClause, params)
      .groupBy('report.report_type')
      .getRawMany();

    // Average severity
    const avg = await this.reportRepo
      .createQueryBuilder('report')
      .select('AVG(COALESCE(report.severity, 1))', 'avg')
      .leftJoin('report.ad', 'ad')
      .where(whereClause, params)
      .getRawOne();

    return {
      by_status: byStatus,
      by_type: byType,
      avg_severity: Number(avg?.avg || 0).toFixed(2)
    };
  }

  // NEW: Get reports for a specific ad (for ad detail page)
  async getByAd(adId: string, currentUser: CurrentUserType) {
    const ad = await this.adRepo.findOne({ where: { id: adId } });
    if (!ad) throw new NotFoundException('Ad not found');

    // Check access
    const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
    if (!isAdmin && ad.owner_id !== currentUser.id) {
      throw new ForbiddenException('You do not have access to this ad\'s reports');
    }

    return this.reportRepo.find({
      where: { ad_id: adId },
      order: { created_at: 'DESC' },
      relations: { ad: true }
    });
  }

  // NEW: Get my ad reports (for agent dashboard)
  async getMyAdReports(userId: string, filters: Omit<ListFilters, 'filterByRole'>) {
    const { page = 1, limit = 10, status, reportType, severity } = filters;

    const queryBuilder = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.ad', 'ad')
      .where('ad.owner_id = :userId', { userId })
      .orderBy('report.created_at', 'DESC');

    if (status) {
      queryBuilder.andWhere('report.status = :status', { status });
    }

    if (reportType) {
      queryBuilder.andWhere('report.report_type = :reportType', { reportType });
    }

    if (severity) {
      queryBuilder.andWhere('report.severity = :severity', { severity });
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

  private async ensureExists(id: string) {
    const exists = await this.reportRepo.exist({ where: { id } });
    if (!exists) throw new NotFoundException('Report not found');
  }
}