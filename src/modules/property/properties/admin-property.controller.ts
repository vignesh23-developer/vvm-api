import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PropertyService } from './services/property.service';

@ApiTags('Admin Properties')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/properties')
export class AdminPropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Get()
  @ApiOperation({ summary: 'List all properties for admin visibility management' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'visibility',
    required: false,
    enum: ['true', 'false'],
    description: 'Filter by admin visibility',
  })
  async listProperties(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('visibility') visibility?: string,
  ) {
    const parsedPage = page === undefined ? 1 : Number(page);
    const parsedLimit = limit === undefined ? 20 : Number(limit);

    if (
      !Number.isInteger(parsedPage) ||
      parsedPage < 1 ||
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1
    ) {
      throw new BadRequestException('Page and limit must be positive integers');
    }

    if (
      visibility !== undefined &&
      visibility !== 'true' &&
      visibility !== 'false'
    ) {
      throw new BadRequestException('Visibility must be true or false');
    }

    return this.propertyService.adminListProperties(
      parsedPage,
      parsedLimit,
      search,
      visibility,
    );
  }

  @Patch(':id/visibility')
  @ApiOperation({ summary: 'Enable or disable a property for public visibility' })
  async toggleVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { visibility?: unknown },
  ) {
    if (typeof body?.visibility !== 'boolean') {
      throw new BadRequestException('visibility must be a boolean');
    }

    return this.propertyService.adminToggleVisibility(id, body.visibility);
  }
}
