import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client;
  private readonly isEnabled: boolean;
  private readonly indexPrefix: string;

  constructor(private readonly configService: ConfigService) {
    this.isEnabled = this.configService.get<boolean>('ELASTICSEARCH_ENABLED', true);
    this.indexPrefix = this.configService.get<string>('ELASTICSEARCH_INDEX_PREFIX', 'vvm');
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.warn('Elasticsearch is DISABLED. Search will fallback to database.');
      return;
    }

    try {
      this.client = new Client({
        node: this.configService.get<string>('ELASTICSEARCH_NODE', 'http://localhost:9200'),
        maxRetries: this.configService.get<number>('ELASTICSEARCH_MAX_RETRIES', 3),
        requestTimeout: this.configService.get<number>('ELASTICSEARCH_REQUEST_TIMEOUT', 30000),
      });

      // Verify connection
      const health = await this.client.cluster.health();
      this.logger.log(`Elasticsearch connected. Cluster: ${health.cluster_name}, Status: ${health.status}`);
    } catch (error) {
      this.logger.error('Failed to connect to Elasticsearch', error.message);
      // Don't throw - allow app to start even if ES is unavailable
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.logger.log('Elasticsearch connection closed');
    }
  }

  getClient(): Client | null {
    return this.client || null;
  }

  isAvailable(): boolean {
    return this.isEnabled && !!this.client;
  }

  getIndexName(baseName: string): string {
    return `${this.indexPrefix}_${baseName}`;
  }

  async getHealth(): Promise<{
    available: boolean;
    status?: string;
    cluster?: string;
    indices?: any[];
  }> {
    if (!this.isAvailable()) {
      return { available: false };
    }

    try {
      const health = await this.client.cluster.health();
      const indices = await this.client.cat.indices({
        index: `${this.indexPrefix}_*`,
        format: 'json',
      });

      return {
        available: true,
        status: (health.status as string).toLowerCase(),
        cluster: health.cluster_name,
        indices: indices.map(idx => ({
          name: idx.index,
          health: idx.health,
          docs: idx['docs.count'],
          size: idx['store.size'],
        })),
      };
    } catch (error) {
      this.logger.error('Health check failed', error.message);
      return { available: false };
    }
  }

  async indexExists(indexName: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      return await this.client.indices.exists({ index: indexName });
    } catch {
      return false;
    }
  }

  async search<T = any>(indexName: string, body: any): Promise<{
    hits: Array<{ _id: string; _score: number; _source: T }>;
    total: number;
    took: number;
    aggregations?: any;
  }> {
    if (!this.isAvailable()) {
      throw new Error('Elasticsearch is not available');
    }

    const response = await this.client.search({
      index: indexName,
      ...body,
    });

    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value || 0;

    return {
      hits: response.hits.hits.map(hit => ({
        _id: hit._id!,
        _score: hit._score || 0,
        _source: hit._source as T,
      })),
      total,
      took: response.took,
      aggregations: response.aggregations,
    };
  }

  async indexDocument(indexName: string, id: string, document: any): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Elasticsearch not available. Document not indexed.');
      return;
    }

    await this.client.index({
      index: indexName,
      id,
      document,
      refresh: 'wait_for',
    });
  }

  async updateDocument(indexName: string, id: string, partialDoc: any): Promise<void> {
    if (!this.isAvailable()) return;

    await this.client.update({
      index: indexName,
      id,
      doc: partialDoc,
      refresh: 'wait_for',
    });
  }

  async deleteDocument(indexName: string, id: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.client.delete({
        index: indexName,
        id,
        refresh: 'wait_for',
      });
    } catch (error: any) {
      if (error.meta?.statusCode !== 404) {
        throw error;
      }
    }
  }

  async bulkIndex(indexName: string, documents: Array<{ id: string; [key: string]: any }>): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    if (!this.isAvailable() || documents.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }

    const operations = documents.flatMap(doc => [
      { index: { _index: indexName, _id: doc.id } },
      doc,
    ]);

    const response = await this.client.bulk({
      refresh: 'wait_for',
      operations,
    });

    const errors: string[] = [];
    let failed = 0;

    if (response.errors) {
      response.items.forEach((item, index) => {
        if (item.index?.error) {
          failed++;
          errors.push(`${documents[index].id}: ${item.index.error.reason}`);
        }
      });
    }

    return {
      success: documents.length - failed,
      failed,
      errors: errors.slice(0, 10), // Limit errors in response
    };
  }

  async getDocument<T = any>(indexName: string, id: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const response = await this.client.get({ index: indexName, id });
      return response._source as T;
    } catch (error: any) {
      if (error.meta?.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }


  async getCount(indexName: string, query?: any): Promise<number> {
    if (!this.isAvailable()) return 0;

    const response = await this.client.count({
      index: indexName,
      query,
    });

    return response.count;
  }
}