import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyReport } from '../../entities/property-report.entity';
import { Property } from '../../entities/properties.entity';
import { CreatePropertyReportDto } from '../dto/create-report.dto';
import { UserType } from '../../../users/enums/usertype';

interface ListFilters {
  page?: number;
  limit?: number;
  status?: string;
  propertyId?: string;
  reportType?: string;
  severity?: number;
  filterByRole?: boolean;
}

interface CurrentUserType {
  id: string;
  roles: UserType[];
}

@Injectable()
export class PropertyReportService {
  constructor(
    @InjectRepository(PropertyReport) private readonly reportRepo: Repository<PropertyReport>,
    @InjectRepository(Property) private readonly propertyRepo: Repository<Property>,
  ) {}

  async create(propertyId: string, dto: CreatePropertyReportDto, reporterId?: string) {
    const property = await this.propertyRepo.findOne({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');

    const created = this.reportRepo.create({
      property_id: propertyId,
      report_type: dto.report_type,
      description: dto.description,
      status: 'PENDING',
      evidence: dto.evidence,
      is_anonymous: !!dto.is_anonymous,
      severity: dto.severity ?? 1,
      reporter_id: dto.reporter_id ?? reporterId,
    });
    return this.reportRepo.save(created);
  }

  // UPDATED: Backward compatible with optional role filtering
  async list(filters: ListFilters, currentUser?: CurrentUserType) {
    const { page = 1, limit = 10, status, propertyId, reportType, severity, filterByRole = false } = filters;

    const queryBuilder = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.property', 'property')
      .orderBy('report.created_at', 'DESC');

    // Role-based filtering (only when filterByRole=true)
    if (currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
      if (!isAdmin) {
        queryBuilder.andWhere(
          '(property.owner_id = :userId)',
          { userId: currentUser.id }
        );
      }
    }

    // Filter by status
    if (status) {
      queryBuilder.andWhere('report.status = :status', { status });
    }

    // Filter by specific property
    if (propertyId) {
      queryBuilder.andWhere('report.property_id = :propertyId', { propertyId });
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
      relations: { property: true }
    });

    if (!report) throw new NotFoundException('Report not found');

    // Access check (only when checkAccess=true)
    if (checkAccess && currentUser) {
      const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
      const property = report.property;
      if (!isAdmin && property?.owner_id !== currentUser.id && property?.agent_id !== currentUser.id) {
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
    });
    return this.reportRepo.findOne({ where: { id }, relations: { property: true } });
  }

  // UPDATED: Backward compatible dismiss with optional admin check
  async dismiss(
    id: string,
    reviewerId: string | undefined,
    resolution_notes?: string,
    currentUser?: CurrentUserType,
    checkAdmin = false
  ) {
    if (checkAdmin && currentUser && !currentUser.roles?.includes(UserType.ADMIN)) {
      throw new ForbiddenException('Only admin can dismiss reports');
    }

    await this.ensureExists(id);
    await this.reportRepo.update(id, {
      status: 'DISMISSED',
      reviewer_id: reviewerId,
      resolution_notes,
      resolved_at: new Date(),
    });
    return this.reportRepo.findOne({ where: { id }, relations: { property: true } });
  }

  // UPDATED: Backward compatible stats with optional role filtering
  async stats(currentUser?: CurrentUserType, filterByRole = false) {
    const isAdmin = !filterByRole || !currentUser || currentUser.roles?.includes(UserType.ADMIN);

    const whereClause = isAdmin ? '1=1' : '(property.owner_id = :userId OR property.agent_id = :userId)';
    const params = isAdmin ? {} : { userId: currentUser.id };

    // Count by status
    const byStatus = await this.reportRepo
      .createQueryBuilder('report')
      .select('report.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('report.property', 'property')
      .where(whereClause, params)
      .groupBy('report.status')
      .getRawMany();

    // Count by type
    const byType = await this.reportRepo
      .createQueryBuilder('report')
      .select('report.report_type', 'report_type')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('report.property', 'property')
      .where(whereClause, params)
      .groupBy('report.report_type')
      .getRawMany();

    // Average severity
    const avg = await this.reportRepo
      .createQueryBuilder('report')
      .select('AVG(COALESCE(report.severity, 1))', 'avg')
      .leftJoin('report.property', 'property')
      .where(whereClause, params)
      .getRawOne();

    return {
      by_status: byStatus,
      by_type: byType,
      avg_severity: Number(avg?.avg || 0).toFixed(2)
    };
  }

  // NEW: Get reports for a specific property
  async getByProperty(propertyId: string, currentUser: CurrentUserType) {
    const property = await this.propertyRepo.findOne({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');

    const isAdmin = currentUser.roles?.includes(UserType.ADMIN);
    if (!isAdmin && property.owner_id !== currentUser.id && property.agent_id !== currentUser.id) {
      throw new ForbiddenException('You do not have access to this property\'s reports');
    }

    return this.reportRepo.find({
      where: { property_id: propertyId },
      order: { created_at: 'DESC' },
      relations: { property: true }
    });
  }

  // NEW: Get my property reports (for agent dashboard)
  async getMyPropertyReports(userId: string, filters: Omit<ListFilters, 'filterByRole'>) {
    const { page = 1, limit = 10, status, reportType, severity } = filters;

    const queryBuilder = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.property', 'property')
      .where('(property.owner_id = :userId OR property.agent_id = :userId)', { userId })
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