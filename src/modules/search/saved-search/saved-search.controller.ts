import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SavedSearchService, SearchEntityType } from './services/saved-search.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Search History')
@Controller('user/search-history')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class SavedSearchController {
  constructor(private readonly savedSearchService: SavedSearchService) {}

  @Get()
  @ApiOperation({ summary: 'Get search history' })
  @ApiQuery({ name: 'entity_type', required: false, enum: SearchEntityType })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: HttpStatus.OK, description: 'Search history' })
  async getHistory(
    @Query('entity_type') entityType?: SearchEntityType,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser() user?: any,
  ) {
    const userId = user?.id;

    if (!userId) {
      return {
        statusCode: HttpStatus.OK,
        data: { data: [], total: 0, page: 1, limit: 20 },
        message: 'No search history for anonymous users',
        timestamp: new Date().toISOString(),
      };
    }

    const result = await this.savedSearchService.getHistory(
      userId,
      entityType,
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

  /**
   * Delete a single search from history
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete search from history' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Search deleted' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: any,
  ) {
    const userId = user?.id;

    if (!userId) {
      return {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      };
    }

    const result = await this.savedSearchService.remove(id, userId);

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Search removed from history',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clear all search history
   */
  @Delete()
  @ApiOperation({ summary: 'Clear all search history' })
  @ApiQuery({ name: 'entity_type', required: false, enum: SearchEntityType })
  @ApiResponse({ status: HttpStatus.OK, description: 'History cleared' })
  async clearHistory(
    @Query('entity_type') entityType?: SearchEntityType,
    @CurrentUser() user?: any,
  ) {
    const userId = user?.id;

    if (!userId) {
      return {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      };
    }

    const result = await this.savedSearchService.clearHistory(userId, entityType);

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Search history cleared',
      timestamp: new Date().toISOString(),
    };
  }
}