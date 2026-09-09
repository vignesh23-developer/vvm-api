import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticsearchService } from './elasticsearch.service';
import { AgentCompanyProfile } from '../../users/entities/agent-company-profile.entity';

@Injectable()
export class AgentIndexingService {
  private readonly logger = new Logger(AgentIndexingService.name);
  private readonly indexName: string;
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    @InjectRepository(AgentCompanyProfile)
    private readonly agentRepository: Repository<AgentCompanyProfile>,
  ) {
    this.indexName = this.elasticsearchService.getIndexName('agents');
  }

  /**
   * Index a single agent by ID
   */
  async indexAgent(agentId: string): Promise<void> {
    this.logger.log(`Indexing agent: ${agentId}`);

    const agent = await this.fetchAgentWithRelations(agentId);

    if (!agent) {
      this.logger.warn(`Agent not found: ${agentId}`);
      return;
    }

    const document = this.transformToEsDocument(agent);
    await this.elasticsearchService.indexDocument(this.indexName, agentId, document);

    this.logger.log(`Agent indexed: ${agentId}`);
  }

  /**
   * Remove an agent from ES index
   */
  async removeAgent(agentId: string): Promise<void> {
    this.logger.log(`Removing agent from index: ${agentId}`);
    await this.elasticsearchService.deleteDocument(this.indexName, agentId);
  }

  /**
   * Update agent in ES (re-index)
   */
  async updateAgent(agentId: string): Promise<void> {
    await this.indexAgent(agentId);
  }

  /**
   * Bulk index all agents
   */
  async reindexAll(): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
    took: number;
  }> {
    this.logger.log('Starting full reindex of all agents');
    const startTime = Date.now();

    let indexed = 0;
    let failed = 0;

    try {
      const total = await this.agentRepository.count();
      this.logger.log(`Total agents to index: ${total}`);

      let offset = 0;
      while (offset < total) {
        const agents = await this.fetchAgentsBatch(offset, this.BATCH_SIZE);

        if (agents.length === 0) break;

        const documents = agents.map(agent => this.transformToEsDocument(agent));

        const result = await this.elasticsearchService.bulkIndex(this.indexName, documents);

        indexed += result.success;
        failed += result.failed;

        if (result.errors.length > 0) {
          this.logger.warn(`Batch errors: ${result.errors.join(', ')}`);
        }

        this.logger.log(`Indexed batch ${offset + 1}-${offset + agents.length} of ${total}`);

        offset += this.BATCH_SIZE;
      }

      const took = Date.now() - startTime;
      this.logger.log(`Reindex completed: ${indexed} indexed, ${failed} failed, ${took}ms`);

      return { success: failed === 0, indexed, failed, took };

    } catch (error) {
      this.logger.error('Reindex failed', error.message);
      return {
        success: false,
        indexed,
        failed: failed + 1,
        took: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetch agent with relations
   */
  private async fetchAgentWithRelations(agentId: string): Promise<AgentCompanyProfile | null> {
    return this.agentRepository.findOne({
      where: { id: agentId },
      relations: ['user'],
    });
  }

  /**
   * Fetch agents batch
   */
  private async fetchAgentsBatch(offset: number, limit: number): Promise<AgentCompanyProfile[]> {
    return this.agentRepository.find({
      relations: ['user'],
      skip: offset,
      take: limit,
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Transform AgentCompanyProfile entity to ES document
   */
  private transformToEsDocument(agent: AgentCompanyProfile): any {
    return {
      id: agent.id,
      profile_name: agent.profileName,
      company_name: agent.companyName,
      short_title: agent.shortTitle,
      description: agent.description,
      company_logo: agent.companyLogo,
      gst_number: agent.gstNumber,

      contact_name: agent.contact_name,
      contact_phone: agent.contact_phone,
      contact_email: agent.contact_email,

      user_id: agent.userId,

      door_number: agent.door_number,
      street_name: agent.street_name,
      address_line: agent.address_line,
      city: agent.city,
      district: agent.district,
      state: agent.state,
      postal_code: agent.postal_code,
      country: agent.country,

      location: agent.latitude && agent.longitude
        ? {
          lat: parseFloat(agent.latitude.toString()),
          lon: parseFloat(agent.longitude.toString()),
        }
        : null,

      is_deactivated: agent.isDeactivated || false,
      is_active: agent.isActive !== false,
      is_verified: agent.isVerified || false,

      expiry_days: agent.expiryDays,
      expiry_date: agent.expiryDate?.toISOString() || null,

      created_at: agent.createdAt?.toISOString(),
      updated_at: agent.updatedAt?.toISOString(),
    };
  }
}