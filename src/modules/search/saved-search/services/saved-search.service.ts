import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedSearch } from '../../entities/saved-search.entity';


export enum SearchEntityType {
  PROPERTY = 'PROPERTY',
  AD = 'AD',
  AGENT = 'AGENT',
}


@Injectable()
export class SavedSearchService {
  private readonly logger = new Logger(SavedSearchService.name);

  constructor(
    @InjectRepository(SavedSearch)
    private readonly savedSearchRepository: Repository<SavedSearch>,
  ) {}


  async autoSave(
    userId: string | null | undefined,
    entityType: SearchEntityType,
    searchCriteria: Record<string, any>,
  ): Promise<void> {
    // Skip if no user (not logged in)
    if (!userId) {
      return;
    }

    // Skip if empty criteria (just browsing)
    if (!searchCriteria || Object.keys(searchCriteria).length === 0) {
      return;
    }

    // Remove pagination from stored criteria
    const { page, limit, include_filters, ...criteria } = searchCriteria;

    // Skip if only pagination params
    if (Object.keys(criteria).length === 0) {
      return;
    }

    try {
      const savedSearch = this.savedSearchRepository.create({
        user_id: userId,
        entity_type: entityType,
        search_criteria: criteria,
        is_active: true,
      });

      await this.savedSearchRepository.save(savedSearch);
      this.logger.debug(`Search saved for user ${userId}`);
    } catch (error) {
      // Don't fail the search if save fails
      this.logger.warn(`Failed to save search: ${error.message}`);
    }
  }


  async getHistory(
    userId: string,
    entityType?: SearchEntityType,
    page = 1,
    limit = 20,
  ): Promise<{
    data: SavedSearch[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: any = { user_id: userId };
    if (entityType) {
      where.entity_type = entityType;
    }

    const [data, total] = await this.savedSearchRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }


  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const result = await this.savedSearchRepository.delete({
      id,
      user_id: userId,
    });
    return { success: (result.affected || 0) > 0 };
  }


  async clearHistory(
    userId: string,
    entityType?: SearchEntityType,
  ): Promise<{ deleted: number }> {
    const where: any = { user_id: userId };
    if (entityType) {
      where.entity_type = entityType;
    }

    const result = await this.savedSearchRepository.delete(where);
    return { deleted: result.affected || 0 };
  }
}