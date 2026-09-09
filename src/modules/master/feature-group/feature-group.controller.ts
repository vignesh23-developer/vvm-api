import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FeatureGroupsService } from './services/feature-groups.service';
import { CreateFeatureGroupDto } from './dto/create-feature-group.dto';
import { UpdateFeatureGroupDto } from './dto/update-feature-group.dto';
import { FeatureGroupResponseDto } from './dto/feature-group-response.dto';

@ApiTags('Feature Groups')
@Controller('master/feature-groups')
export class FeatureGroupsController {
  constructor(private readonly service: FeatureGroupsService) {}

  @ApiOperation({
    summary: 'List feature groups',
    description: 'Returns feature groups, optionally only active.'
  })
  @ApiQuery({
    name: 'activeOnly',
    required: false,
    type: Boolean,
    example: true,
    description: 'If true, returns only active groups (default: true)'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (default: 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page (default: 10, max: 50)'
  })
  @ApiResponse({
    status: 200,
    description: 'Array of feature groups',
    type: [FeatureGroupResponseDto],
    example: {
      data: [
        {
          id: '99999999-8888-7777-6666-555555555555',
          name: 'Area Details',
          icon: 'home',
          sortOrder: 1,
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      limit: 10
    }
  })
  @Get()
  list(
    @Query('activeOnly') activeOnly?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10'
  ): Promise<{
    data: FeatureGroupResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const flag = activeOnly === undefined ? true : activeOnly === 'true';
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = parseInt(limit, 10) <= 0 ? 0 : Math.min(parseInt(limit, 10) || 10, 50);
    return this.service.findAll(flag, p, l);
  }

  @ApiOperation({ summary: 'Get feature group by id' })
  @ApiResponse({ status: 200, type: FeatureGroupResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Create feature group' })
  @ApiResponse({ status: 201, type: FeatureGroupResponseDto })
  @Post()
  create(@Body() dto: CreateFeatureGroupDto) {
    return this.service.create(dto);
  }

  @ApiOperation({ summary: 'Update feature group' })
  @ApiResponse({ status: 200, type: FeatureGroupResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeatureGroupDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Update feature group active status' })
  @ApiQuery({ name: 'isActive', required: true, type: Boolean, example: false })
  @ApiResponse({ status: 200, type: FeatureGroupResponseDto })
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Query('isActive') isActive: string) {
    return this.service.updateStatus(id, isActive === 'true');
  }
}
