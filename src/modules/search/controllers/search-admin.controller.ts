import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import { PropertyIndexingService } from '../services/property-indexing.service';
import { ElasticsearchService } from '../services/elasticsearch.service';
import { AdIndexingService } from '../services/ad-indexing.service';
import { AgentIndexingService } from '../services/agent-indexing.service';
import { ElasticsearchIndexInitService } from '../services/elasticsearch-index-init.service';

@ApiTags('Search Admin')
@Controller('admin/search')
@ApiBearerAuth()
export class SearchAdminController {
  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly propertyIndexingService: PropertyIndexingService,
    private readonly adIndexingService: AdIndexingService,
    private readonly agentIndexingService: AgentIndexingService,
    private readonly indexInitService: ElasticsearchIndexInitService
  ) {}


  @Post('indices/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize all ES indices',
    description:
      'Creates indices if they do not exist. Safe to call multiple times.'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Initialization results' })
  async initializeIndices() {
    const results = await this.indexInitService.initializeAllIndices();
    return {
      statusCode: 200,
      data: results,
      message: 'Index initialization complete',
      timestamp: new Date().toISOString()
    };
  }

  @Post('indices/:indexType/recreate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recreate a specific index',
    description:
      'WARNING: Deletes all data in the index! Use reindex endpoint after this.'
  })
  @ApiParam({ name: 'indexType', enum: ['properties', 'ads', 'agents'] })
  @ApiResponse({ status: HttpStatus.OK, description: 'Index recreated' })
  async recreateIndex(
    @Param('indexType') indexType: 'properties' | 'ads' | 'agents'
  ) {
    const result = await this.indexInitService.recreateIndex(indexType);
    return {
      statusCode: 200,
      data: result,
      message:
        result.action === 'recreated'
          ? `Index ${indexType} recreated. Run reindex to populate data.`
          : result.message,
      timestamp: new Date().toISOString()
    };
  }

  @Post('indices/recreate-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recreate all indices',
    description:
      'WARNING: Deletes ALL search data! Use reindex-all endpoint after this.'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'All indices recreated' })
  async recreateAllIndices() {
    const results = await this.indexInitService.recreateAllIndices();
    return {
      statusCode: 200,
      data: results,
      message: 'All indices recreated. Run reindex endpoints to populate data.',
      timestamp: new Date().toISOString()
    };
  }

  @Get('indices/:indexType')
  @ApiOperation({ summary: 'Get index information' })
  @ApiParam({ name: 'indexType', enum: ['properties', 'ads', 'agents'] })
  async getIndexInfo(
    @Param('indexType') indexType: 'properties' | 'ads' | 'agents'
  ) {
    const info = await this.indexInitService.getIndexInfo(indexType);
    return {
      statusCode: 200,
      data: info,
      message: 'Index info retrieved',
      timestamp: new Date().toISOString()
    };
  }

  @Post('indices/:indexType/update-mappings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update index mappings',
    description:
      'Adds new fields to existing index. Cannot modify existing field types.'
  })
  @ApiParam({ name: 'indexType', enum: ['properties', 'ads', 'agents'] })
  async updateMappings(
    @Param('indexType') indexType: 'properties' | 'ads' | 'agents'
  ) {
    const result = await this.indexInitService.updateMappings(indexType);
    return {
      statusCode: result.success ? 200 : 400,
      data: result,
      message: result.message,
      timestamp: new Date().toISOString()
    };
  }

  @Post('setup/:indexType')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Full setup: recreate index and reindex all data',
    description:
      'Recreates the index with fresh mappings, then indexes all data. WARNING: Deletes existing data!'
  })
  @ApiParam({ name: 'indexType', enum: ['properties', 'ads', 'agents'] })
  async fullSetup(
    @Param('indexType') indexType: 'properties' | 'ads' | 'agents'
  ) {
    const recreateResult = await this.indexInitService.recreateIndex(indexType);
    if (recreateResult.action === 'error') {
      return {
        statusCode: 400,
        data: { recreate: recreateResult },
        message: `Failed to recreate index: ${recreateResult.message}`,
        timestamp: new Date().toISOString()
      };
    }

    let reindexResult: any;
    switch (indexType) {
      case 'properties':
        reindexResult = await this.propertyIndexingService.reindexAll();
        break;
      case 'ads':
        reindexResult = await this.adIndexingService.reindexAll();
        break;
      case 'agents':
        reindexResult = await this.agentIndexingService.reindexAll();
        break;
    }

    return {
      statusCode: 200,
      data: {
        recreate: recreateResult,
        reindex: reindexResult
      },
      message: `Setup complete for ${indexType}: ${reindexResult.indexed} documents indexed`,
      timestamp: new Date().toISOString()
    };
  }

  @Post('setup-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Full setup for all indices',
    description:
      'Recreates all indices and reindexes all data. WARNING: Deletes all existing search data!'
  })
  async fullSetupAll() {
    const results: any = {};

    const propRecreate =
      await this.indexInitService.recreateIndex('properties');
    const propReindex =
      propRecreate.action !== 'error'
        ? await this.propertyIndexingService.reindexAll()
        : { error: 'Skipped due to recreate failure' };
    results.properties = { recreate: propRecreate, reindex: propReindex };

    const adsRecreate = await this.indexInitService.recreateIndex('ads');
    const adsReindex =
      adsRecreate.action !== 'error'
        ? await this.adIndexingService.reindexAll()
        : { error: 'Skipped due to recreate failure' };
    results.ads = { recreate: adsRecreate, reindex: adsReindex };

    const agentsRecreate = await this.indexInitService.recreateIndex('agents');
    const agentsReindex =
      agentsRecreate.action !== 'error'
        ? await this.agentIndexingService.reindexAll()
        : { error: 'Skipped due to recreate failure' };
    results.agents = { recreate: agentsRecreate, reindex: agentsReindex };

    return {
      statusCode: 200,
      data: results,
      message: 'Full setup complete for all indices',
      timestamp: new Date().toISOString()
    };
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reindex all properties' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reindex completed' })
  async reindexAll() {
    const result = await this.propertyIndexingService.reindexAll();
    return {
      statusCode: 200,
      data: result,
      message: result.success
        ? `Successfully indexed ${result.indexed} properties`
        : `Indexed ${result.indexed} properties with ${result.failed} failures`,
      timestamp: new Date().toISOString()
    };
  }

  @Post('index/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Index a single property' })
  async indexProperty(@Param('id', ParseUUIDPipe) id: string) {
    await this.propertyIndexingService.indexProperty(id);
    return {
      statusCode: 200,
      data: { id },
      message: `Property ${id} indexed successfully`,
      timestamp: new Date().toISOString()
    };
  }

  @Delete('index/:id')
  @ApiOperation({ summary: 'Remove property from index' })
  async removeFromIndex(@Param('id', ParseUUIDPipe) id: string) {
    await this.propertyIndexingService.removeProperty(id);
    return {
      statusCode: 200,
      data: { id },
      message: `Property ${id} removed from index`,
      timestamp: new Date().toISOString()
    };
  }

  @Post('reindex/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reindex specific properties by IDs' })
  async reindexBatch(@Body() body: { property_ids: string[] }) {
    const result = await this.propertyIndexingService.reindexByIds(
      body.property_ids
    );
    return {
      statusCode: 200,
      data: result,
      message: `Indexed ${result.indexed} of ${body.property_ids.length} properties`,
      timestamp: new Date().toISOString()
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get index statistics' })
  async getStats() {
    const health = await this.elasticsearchService.getHealth();
    return {
      statusCode: 200,
      data: health,
      message: 'Index statistics retrieved',
      timestamp: new Date().toISOString()
    };
  }

  @Post('ads/reindex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reindex all ads' })
  async reindexAllAds() {
    const result = await this.adIndexingService.reindexAll();
    return {
      statusCode: 200,
      data: result,
      message: result.success
        ? `Successfully indexed ${result.indexed} ads`
        : `Indexed ${result.indexed} ads with ${result.failed} failures`,
      timestamp: new Date().toISOString()
    };
  }

  @Post('ads/index/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Index a single ad' })
  async indexAd(@Param('id', ParseUUIDPipe) id: string) {
    await this.adIndexingService.indexAd(id);
    return {
      statusCode: 200,
      data: { id },
      message: `Ad ${id} indexed successfully`,
      timestamp: new Date().toISOString()
    };
  }

  @Delete('ads/index/:id')
  @ApiOperation({ summary: 'Remove ad from index' })
  async removeAdFromIndex(@Param('id', ParseUUIDPipe) id: string) {
    await this.adIndexingService.removeAd(id);
    return {
      statusCode: 200,
      data: { id },
      message: `Ad ${id} removed from index`,
      timestamp: new Date().toISOString()
    };
  }

  @Post('agents/reindex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reindex all agents' })
  async reindexAllAgents() {
    const result = await this.agentIndexingService.reindexAll();
    return {
      statusCode: 200,
      data: result,
      message: result.success
        ? `Successfully indexed ${result.indexed} agents`
        : `Indexed ${result.indexed} agents with ${result.failed} failures`,
      timestamp: new Date().toISOString()
    };
  }

  @Post('agents/index/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Index a single agent' })
  async indexAgent(@Param('id', ParseUUIDPipe) id: string) {
    await this.agentIndexingService.indexAgent(id);
    return {
      statusCode: 200,
      data: { id },
      message: `Agent ${id} indexed successfully`,
      timestamp: new Date().toISOString()
    };
  }

  @Delete('agents/index/:id')
  @ApiOperation({ summary: 'Remove agent from index' })
  async removeAgentFromIndex(@Param('id', ParseUUIDPipe) id: string) {
    await this.agentIndexingService.removeAgent(id);
    return {
      statusCode: 200,
      data: { id },
      message: `Agent ${id} removed from index`,
      timestamp: new Date().toISOString()
    };
  }
}
