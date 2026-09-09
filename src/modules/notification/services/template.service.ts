import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { MessagingTemplate } from '../entities/messaging-template.entity';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateFilterDto
} from '../dto';
import {
  NotificationCategory,
  NotificationChannel
} from '../enums/notification.enum';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class TemplateService {
  private readonly CACHE_PREFIX = 'template:';
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly ALL_TEMPLATES_KEY = 'templates:all';

  constructor(
    @InjectRepository(MessagingTemplate)
    private readonly templateRepo: Repository<MessagingTemplate>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(TemplateService.name);
  }

  // ============================================
  // CACHE HELPERS
  // ============================================

  private getCacheKey(code: string): string {
    return `${this.CACHE_PREFIX}${code}`;
  }

  async clearTemplateCache(code?: string): Promise<void> {
    try {
      if (code) {
        await this.cacheManager.del(this.getCacheKey(code));
      }
      // Always clear the all-templates cache
      await this.cacheManager.del(this.ALL_TEMPLATES_KEY);
      this.logger.info({ code }, 'Template cache cleared');
    } catch (error) {
      this.logger.error({ error, code }, 'Failed to clear template cache');
    }
  }

  async getByCode(code: string): Promise<MessagingTemplate | null> {
    const cacheKey = this.getCacheKey(code);

    // Try cache first
    try {
      const cached = await this.cacheManager.get<MessagingTemplate>(cacheKey);
      if (cached) {
        this.logger.debug({ code }, 'Template cache HIT');
        return cached;
      }
    } catch (error) {
      this.logger.warn({ error, code }, 'Cache read failed');
    }

    // Fetch from DB
    const template = await this.templateRepo.findOne({
      where: { code, is_active: true }
    });

    if (template) {
      // Store in cache
      try {
        await this.cacheManager.set(cacheKey, template, this.CACHE_TTL);
        this.logger.debug({ code }, 'Template cached');
      } catch (error) {
        this.logger.warn({ error, code }, 'Cache write failed');
      }
    }

    return template;
  }

  async findAll(filter?: TemplateFilterDto): Promise<{
    data: MessagingTemplate[];
    total: number;
  }> {
    const query = this.templateRepo.createQueryBuilder('t');

    // Apply filters
    if (filter?.category) {
      query.andWhere('t.category = :category', { category: filter.category });
    }

    if (filter?.channel) {
      query.andWhere('t.channels @> :channel', {
        channel: JSON.stringify([filter.channel])
      });
    }

    if (filter?.is_active !== undefined) {
      query.andWhere('t.is_active = :is_active', {
        is_active: filter.is_active
      });
    }

    if (filter?.search) {
      query.andWhere('(t.code ILIKE :search OR t.name ILIKE :search)', {
        search: `%${filter.search}%`
      });
    }

    if (filter?.consumes_quota !== undefined) {
      query.andWhere('t.consumes_quota = :consumes_quota', {
        consumes_quota: filter.consumes_quota
      });
    }

    // Sorting
    const sortBy = filter?.sortBy || 'category';
    const sortOrder = filter?.sortOrder || 'ASC';
    query.orderBy(`t.${sortBy}`, sortOrder);

    // Pagination
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total };
  }

  async findById(id: string): Promise<MessagingTemplate> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    return template;
  }

  async create(dto: CreateTemplateDto): Promise<MessagingTemplate> {
    // Check if code already exists
    const existing = await this.templateRepo.findOne({
      where: { code: dto.code }
    });
    if (existing) {
      throw new ConflictException(
        `Template with code ${dto.code} already exists`
      );
    }

    const template = this.templateRepo.create(dto);
    const saved = await this.templateRepo.save(template);

    // Clear cache
    await this.clearTemplateCache();

    this.logger.info({ code: dto.code }, 'Template created');
    return saved;
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<MessagingTemplate> {
    const template = await this.findById(id);

    // If code is being changed, check for conflicts
    if (dto.code && dto.code !== template.code) {
      const existing = await this.templateRepo.findOne({
        where: { code: dto.code }
      });
      if (existing) {
        throw new ConflictException(
          `Template with code ${dto.code} already exists`
        );
      }
    }

    // Update fields
    Object.assign(template, dto);
    const saved = await this.templateRepo.save(template);

    // Clear cache for old and new code
    await this.clearTemplateCache(template.code);
    if (dto.code) {
      await this.clearTemplateCache(dto.code);
    }

    this.logger.info({ id, code: saved.code }, 'Template updated');
    return saved;
  }

  async delete(id: string): Promise<void> {
    const template = await this.findById(id);
    template.is_active = false;
    await this.templateRepo.save(template);

    // Clear cache
    await this.clearTemplateCache(template.code);

    this.logger.info({ id, code: template.code }, 'Template deactivated');
  }

  async hardDelete(id: string): Promise<void> {
    const template = await this.findById(id);
    await this.templateRepo.remove(template);

    // Clear cache
    await this.clearTemplateCache(template.code);

    this.logger.info(
      { id, code: template.code },
      'Template permanently deleted'
    );
  }

  async bulkUpdateStatus(ids: string[], is_active: boolean): Promise<number> {
    const result = await this.templateRepo.update(ids, { is_active });

    // Clear all cache
    await this.clearTemplateCache();

    this.logger.info(
      { count: result.affected, is_active },
      'Bulk status update'
    );
    return result.affected || 0;
  }

  async getByCategory(
    category: NotificationCategory
  ): Promise<MessagingTemplate[]> {
    return this.templateRepo.find({
      where: { category, is_active: true },
      order: { code: 'ASC' }
    });
  }

  getEnabledChannels(template: MessagingTemplate): NotificationChannel[] {
    const channels: NotificationChannel[] = [];

    if (template.in_app_enabled) {
      channels.push(NotificationChannel.IN_APP);
      channels.push(NotificationChannel.SSE); // SSE is always enabled with in_app
    }
    if (template.push_enabled) channels.push(NotificationChannel.PUSH);
    if (template.email_enabled) channels.push(NotificationChannel.EMAIL);
    if (template.sms_enabled) channels.push(NotificationChannel.SMS);
    if (template.whatsapp_enabled) channels.push(NotificationChannel.WHATSAPP);

    return channels;
  }

  substituteVariables(text: string, variables: Record<string, any>): string {
    if (!text) return text;

    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value ?? ''));
    }

    return result;
  }

  async preloadToCache(): Promise<number> {
    const templates = await this.templateRepo.find({
      where: { is_active: true }
    });

    let count = 0;
    for (const template of templates) {
      try {
        await this.cacheManager.set(
          this.getCacheKey(template.code),
          template,
          this.CACHE_TTL
        );
        count++;
      } catch (error) {
        this.logger.warn(
          { error, code: template.code },
          'Failed to cache template'
        );
      }
    }

    this.logger.info({ count }, 'Templates preloaded to cache');
    return count;
  }
}
