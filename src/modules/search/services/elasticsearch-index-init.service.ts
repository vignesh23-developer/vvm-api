import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from './elasticsearch.service';
import {
  allIndexConfigs,
  IndexConfig,
  propertiesIndexConfig,
  adsIndexConfig,
  agentsIndexConfig,
} from '../config/elasticsearch-indices.config';

export interface IndexInitResult {
  index: string;
  action: 'created' | 'exists' | 'recreated' | 'error';
  message: string;
}

@Injectable()
export class ElasticsearchIndexInitService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchIndexInitService.name);
  private readonly autoInit: boolean;

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly configService: ConfigService,
  ) {
    // Auto-initialize indices on startup (can be disabled via env)
    this.autoInit = this.configService.get<boolean>('ELASTICSEARCH_AUTO_INIT', true);
  }

  /**
   * On module init - auto-create indices if enabled
   */
  async onModuleInit(): Promise<void> {
    if (!this.elasticsearchService.isAvailable()) {
      this.logger.warn('Elasticsearch not available. Skipping index initialization.');
      return;
    }

    if (!this.autoInit) {
      this.logger.log('Auto index initialization is disabled.');
      return;
    }

    this.logger.log('Initializing Elasticsearch indices...');
    const results = await this.initializeAllIndices();

    const created = results.filter(r => r.action === 'created').length;
    const exists = results.filter(r => r.action === 'exists').length;
    const errors = results.filter(r => r.action === 'error').length;

    this.logger.log(
      `Index initialization complete: ${created} created, ${exists} already exist, ${errors} errors`,
    );
  }

  /**
   * Initialize all indices (create if not exists)
   */
  async initializeAllIndices(): Promise<IndexInitResult[]> {
    const results: IndexInitResult[] = [];

    for (const config of allIndexConfigs) {
      const result = await this.ensureIndex(config);
      results.push(result);
    }

    return results;
  }

  /**
   * Ensure a single index exists with correct mappings
   */
  async ensureIndex(config: IndexConfig): Promise<IndexInitResult> {
    const indexName = this.elasticsearchService.getIndexName(config.name);

    try {
      const exists = await this.elasticsearchService.indexExists(indexName);

      if (exists) {
        this.logger.log(`Index ${indexName} already exists`);
        return {
          index: indexName,
          action: 'exists',
          message: 'Index already exists',
        };
      }

      // Create the index
      await this.createIndex(indexName, config);

      this.logger.log(`Index ${indexName} created successfully`);
      return {
        index: indexName,
        action: 'created',
        message: 'Index created successfully',
      };

    } catch (error) {
      this.logger.error(`Failed to initialize index ${indexName}`, error.message);
      return {
        index: indexName,
        action: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Recreate an index (delete and create fresh)
   * WARNING: This deletes all data in the index!
   */
  async recreateIndex(indexType: 'properties' | 'ads' | 'agents'): Promise<IndexInitResult> {
    const configMap: Record<string, IndexConfig> = {
      properties: propertiesIndexConfig,
      ads: adsIndexConfig,
      agents: agentsIndexConfig,
    };

    const config = configMap[indexType];
    if (!config) {
      return {
        index: indexType,
        action: 'error',
        message: `Unknown index type: ${indexType}`,
      };
    }

    const indexName = this.elasticsearchService.getIndexName(config.name);

    try {
      const client = this.elasticsearchService.getClient();
      if (!client) {
        throw new Error('Elasticsearch client not available');
      }

      // Delete if exists
      const exists = await this.elasticsearchService.indexExists(indexName);
      if (exists) {
        this.logger.warn(`Deleting existing index: ${indexName}`);
        await client.indices.delete({ index: indexName });
      }

      // Create fresh
      await this.createIndex(indexName, config);

      this.logger.log(`Index ${indexName} recreated successfully`);
      return {
        index: indexName,
        action: 'recreated',
        message: 'Index deleted and recreated successfully. Remember to reindex data!',
      };

    } catch (error) {
      this.logger.error(`Failed to recreate index ${indexName}`, error.message);
      return {
        index: indexName,
        action: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Recreate all indices
   * WARNING: This deletes all data!
   */
  async recreateAllIndices(): Promise<IndexInitResult[]> {
    const results: IndexInitResult[] = [];

    for (const indexType of ['properties', 'ads', 'agents'] as const) {
      const result = await this.recreateIndex(indexType);
      results.push(result);
    }

    return results;
  }

  /**
   * Create index with settings and mappings
   */
  private async createIndex(indexName: string, config: IndexConfig): Promise<void> {
    const client = this.elasticsearchService.getClient();
    if (!client) {
      throw new Error('Elasticsearch client not available');
    }

    await client.indices.create({
      index: indexName,
      settings: config.settings,
      mappings: config.mappings,
    });
  }

  /**
   * Get index info (mappings, settings, stats)
   */
  async getIndexInfo(indexType: 'properties' | 'ads' | 'agents'): Promise<any> {
    const configMap: Record<string, IndexConfig> = {
      properties: propertiesIndexConfig,
      ads: adsIndexConfig,
      agents: agentsIndexConfig,
    };

    const config = configMap[indexType];
    if (!config) {
      return { error: `Unknown index type: ${indexType}` };
    }

    const indexName = this.elasticsearchService.getIndexName(config.name);
    const client = this.elasticsearchService.getClient();

    if (!client) {
      return { error: 'Elasticsearch client not available' };
    }

    try {
      const exists = await this.elasticsearchService.indexExists(indexName);
      if (!exists) {
        return {
          index: indexName,
          exists: false,
          expectedMappings: config.mappings,
        };
      }

      const [mappings, settings, stats] = await Promise.all([
        client.indices.getMapping({ index: indexName }),
        client.indices.getSettings({ index: indexName }),
        client.indices.stats({ index: indexName }),
      ]);

      return {
        index: indexName,
        exists: true,
        mappings: mappings[indexName]?.mappings,
        settings: settings[indexName]?.settings,
        stats: {
          docs: stats.indices?.[indexName]?.total?.docs?.count || 0,
          size: stats.indices?.[indexName]?.total?.store?.size_in_bytes || 0,
        },
      };

    } catch (error) {
      return {
        index: indexName,
        error: error.message,
      };
    }
  }

  /**
   * Update index mappings (only adds new fields, doesn't modify existing)
   * Useful for adding new fields without recreating the index
   */
  async updateMappings(indexType: 'properties' | 'ads' | 'agents'): Promise<{
    success: boolean;
    message: string;
  }> {
    const configMap: Record<string, IndexConfig> = {
      properties: propertiesIndexConfig,
      ads: adsIndexConfig,
      agents: agentsIndexConfig,
    };

    const config = configMap[indexType];
    if (!config) {
      return { success: false, message: `Unknown index type: ${indexType}` };
    }

    const indexName = this.elasticsearchService.getIndexName(config.name);
    const client = this.elasticsearchService.getClient();

    if (!client) {
      return { success: false, message: 'Elasticsearch client not available' };
    }

    try {
      await client.indices.putMapping({
        index: indexName,
        properties: config.mappings.properties,
        dynamic_templates: config.mappings.dynamic_templates,
      });

      return { success: true, message: `Mappings updated for ${indexName}` };

    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}