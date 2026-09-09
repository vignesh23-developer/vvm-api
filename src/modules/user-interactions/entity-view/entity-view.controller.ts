import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { EntityViewService } from './services/entity-view.service';
import { RecordViewDto, GetRecentlyViewedDto, ViewEntityType } from './dto/entity-view.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Recently Viewed')
@Controller('user')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class EntityViewController {
  constructor(private readonly entityViewService: EntityViewService) {}

  /**
   * Record a view
   */
  @Post('views')
  @ApiOperation({ summary: 'Record a property or ad view' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'View recorded' })
  async recordView(
    @Body() dto: RecordViewDto,
    @CurrentUser() user: any
  ) {

    const view = await this.entityViewService.recordView(
      user.id,
      dto.entity_type,
      dto.entity_id,
    );

    return {
      statusCode: HttpStatus.CREATED,
      data: view,
      message: 'View recorded successfully',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get recently viewed (all types)
   */
  @Get('recently-viewed')
  @ApiOperation({ summary: 'Get recently viewed properties and ads' })
  @ApiQuery({ name: 'entity_type', required: false, enum: ViewEntityType })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: HttpStatus.OK, description: 'Recently viewed items' })
  async getRecentlyViewed(
    @Query() dto: GetRecentlyViewedDto,
    @CurrentUser() user: any
  ) {
    const result = await this.entityViewService.getRecentlyViewed(user.id, dto);

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Data retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get recently viewed properties only
   */
  @Get('recently-viewed/properties')
  @ApiOperation({ summary: 'Get recently viewed properties' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: HttpStatus.OK, description: 'Recently viewed properties' })
  async getRecentlyViewedProperties(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @CurrentUser() user: any,
  ) {

    const result = await this.entityViewService.getRecentlyViewedProperties(
      user.id,
      +page,
      +limit,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Data retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('recently-viewed/ads')
  @ApiOperation({ summary: 'Get recently viewed ads' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: HttpStatus.OK, description: 'Recently viewed ads' })
  async getRecentlyViewedAds(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @CurrentUser() user: any
  ) {

    const result = await this.entityViewService.getRecentlyViewedAds(
      user.id,
      +page,
      +limit,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Data retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }


  @Delete('recently-viewed')
  @ApiOperation({ summary: 'Clear all view history' })
  @ApiQuery({ name: 'entity_type', required: false, enum: ViewEntityType })
  @ApiResponse({ status: HttpStatus.OK, description: 'History cleared' })
  async clearHistory(
    @Query('entity_type') entityType?: ViewEntityType,
    @CurrentUser() user: any = null
  ) {
    const result = await this.entityViewService.clearHistory(user.id, entityType);

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'History cleared successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('recently-viewed/:entityType/:entityId')
  @ApiOperation({ summary: 'Remove single item from view history' })
  @ApiResponse({ status: HttpStatus.OK, description: 'View removed' })
  async removeView(
    @Param('entityType') entityType: ViewEntityType,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() user: any,
  ) {

    const result = await this.entityViewService.removeView(
      user.id,
      entityType,
      entityId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'View removed from history',
      timestamp: new Date().toISOString(),
    };
  }
}