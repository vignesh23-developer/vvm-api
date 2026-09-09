import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../redis-cache/services/redis-cache.service';

@Injectable()
export class AutocompleteCacheService {
  private readonly logger = new Logger(AutocompleteCacheService.name);
  private readonly DEFAULT_TTL = 300; // 5 minutes in seconds

  constructor(private readonly redisCacheService: RedisCacheService) {}

  private generateKey(
    type: 'property' | 'ad' | 'agent',
    query: string | undefined,
    filters: Record<string, any> = {}
  ): string {
    const filterStr = Object.entries(filters)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');

    const normalizedQuery = (query || '').toLowerCase().trim();
    return `autocomplete:${type}:${normalizedQuery}:${filterStr}`;
  }

  async get<T>(
    type: 'property' | 'ad' | 'agent',
    query: string | undefined,
    filters?: Record<string, any>
  ): Promise<T | null> {
    const key = this.generateKey(type, query, filters);
    this.logger.debug(`Cache GET attempt: ${key}`);

    const cached = await this.redisCacheService.get<T>(key);

    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
      return cached;
    }

    this.logger.debug(`Cache MISS: ${key}`);
    return null;
  }

  async set<T>(
    type: 'property' | 'ad' | 'agent',
    query: string | undefined,
    data: T,
    filters?: Record<string, any>,
    ttl?: number
  ): Promise<void> {
    const key = this.generateKey(type, query, filters);
    await this.redisCacheService.set(key, data, ttl || this.DEFAULT_TTL);
    this.logger.debug(`Cache SET: ${key}`);
  }

  async delete(
    type: 'property' | 'ad' | 'agent',
    query: string | undefined,
    filters?: Record<string, any>
  ): Promise<void> {
    const key = this.generateKey(type, query, filters);
    await this.redisCacheService.del(key);
    this.logger.debug(`Cache DEL: ${key}`);
  }

  async clearAll(): Promise<void> {
    await this.redisCacheService.reset();
    this.logger.log('Cache cleared');
  }
}
