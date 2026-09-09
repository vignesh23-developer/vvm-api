// src/modules/agent/services/agent-stats.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../../../property/entities/properties.entity';
import { Enquiry } from '../../../user-interactions/entities/enquiry.entity';
import { LeadStatus } from '../../../user-interactions/entities/lead-status.entity';
import { EntityView } from '../../../user-interactions/entities/entity-view.entity';
import { Favorite } from '../../../user-interactions/entities/favorite.entity';


export interface AgentStatsResponse {
  totalPropertiesPosted: number;
  totalPropertiesSold: number;
  totalPropertiesRented: number;
  activeListings: number;
  pendingApproval: number;
  totalEnquiriesReceived: number;
  totalLeadsConverted: number;
  totalFavorites: number;
  totalViews: number;
}

@Injectable()
export class AgentStatsService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(Enquiry)
    private readonly enquiryRepo: Repository<Enquiry>,
    @InjectRepository(LeadStatus)
    private readonly leadStatusRepo: Repository<LeadStatus>,
    @InjectRepository(EntityView)
    private readonly entityViewRepo: Repository<EntityView>,
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
  ) {}

  /**
   * Get all stats for an agent
   */
  async getAgentStats(agentId: string): Promise<AgentStatsResponse> {
    const [
      propertyStats,
      enquiryCount,
      leadsConverted,
      totalFavorites,
      totalViews
    ] = await Promise.all([
      this.getPropertyStats(agentId),
      this.getEnquiryCount(agentId),
      this.getLeadsConvertedCount(agentId),
      this.getFavoritesCount(agentId),
      this.getViewsCount(agentId)
    ]);

    return {
      ...propertyStats,
      totalEnquiriesReceived: enquiryCount,
      totalLeadsConverted: leadsConverted,
      totalFavorites,
      totalViews
    };
  }

  /**
   * Get property stats (posted, sold, rented, active, pending)
   */
  private async getPropertyStats(agentId: string): Promise<{
    totalPropertiesPosted: number;
    totalPropertiesSold: number;
    totalPropertiesRented: number;
    activeListings: number;
    pendingApproval: number;
  }> {
    const stats = await this.propertyRepo
      .createQueryBuilder('p')
      .select([
        `SUM(CASE WHEN p.approval_status = 'APPROVED' AND p.is_published = true AND p.is_active = true THEN 1 ELSE 0 END) as total`,
        `SUM(CASE WHEN p.status = 'SOLD' THEN 1 ELSE 0 END) as sold`,
        `SUM(CASE WHEN p.status = 'RENTED' THEN 1 ELSE 0 END) as rented`,
        `SUM(CASE WHEN p.status = 'AVAILABLE' AND p.is_active = true AND p.approval_status = 'APPROVED' AND p.is_published = true THEN 1 ELSE 0 END) as active`,
        `SUM(CASE WHEN p.approval_status = 'UNDER_REVIEW' THEN 1 ELSE 0 END) as pending`
      ])
      .where('p.agent_id = :agentId', { agentId })
      .getRawOne();

    return {
      totalPropertiesPosted: parseInt(stats.total) || 0,
      totalPropertiesSold: parseInt(stats.sold) || 0,
      totalPropertiesRented: parseInt(stats.rented) || 0,
      activeListings: parseInt(stats.active) || 0,
      pendingApproval: parseInt(stats.pending) || 0
    };
  }

  /**
   * Get total enquiries received on agent's properties
   */
  private async getEnquiryCount(agentId: string): Promise<number> {
    const result = await this.enquiryRepo
      .createQueryBuilder('e')
      .innerJoin('properties', 'p', 'p.id = e.entity_id')
      .where('e.entity_type = :type', { type: 'PROPERTY' })
      .andWhere('p.agent_id = :agentId', { agentId })
      .getCount();

    return result;
  }

  /**
   * Get leads converted count (enquiries with status CONVERTED/CLOSED_WON)
   */
  private async getLeadsConvertedCount(agentId: string): Promise<number> {
    const result = await this.leadStatusRepo
      .createQueryBuilder('ls')
      .innerJoin('enquiries', 'e', 'e.id = ls.enquiry_id')
      .innerJoin('properties', 'p', 'p.id = e.entity_id')
      .where('e.entity_type = :type', { type: 'PROPERTY' })
      .andWhere('p.agent_id = :agentId', { agentId })
      .andWhere('ls.status IN (:...statuses)', { statuses: ['CONVERTED', 'CLOSED_WON', 'SOLD'] })
      .getCount();

    return result;
  }

  /**
   * Get total favorites on agent's properties
   */
  private async getFavoritesCount(agentId: string): Promise<number> {
    const result = await this.favoriteRepo
      .createQueryBuilder('f')
      .innerJoin('properties', 'p', 'p.id = f.entity_id')
      .where('f.entity_type = :type', { type: 'PROPERTY' })
      .andWhere('p.agent_id = :agentId', { agentId })
      .getCount();

    return result;
  }

  /**
   * Get total views on agent's properties
   */
  private async getViewsCount(agentId: string): Promise<number> {
    const result = await this.entityViewRepo
      .createQueryBuilder('ev')
      .select('SUM(ev.view_count)', 'total')
      .innerJoin('properties', 'p', 'p.id = ev.entity_id')
      .where('ev.entity_type = :type', { type: 'PROPERTY' })
      .andWhere('p.agent_id = :agentId', { agentId })
      .getRawOne();

    return parseInt(result?.total) || 0;
  }
}