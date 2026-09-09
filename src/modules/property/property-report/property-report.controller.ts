import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiBearerAuth,
  ApiResponse
} from '@nestjs/swagger';
import { PropertyReportService } from './services/property-report.service';
import { CreatePropertyReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';

@ApiTags('Property Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('property-reports')
export class PropertyReportController {
  constructor(private readonly service: PropertyReportService) {}

  @Post(':propertyId')
  @ApiOperation({ summary: 'Report a property' })
  @ApiResponse({
    status: 201,
    description: 'Property report created successfully'
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiParam({ name: 'propertyId', description: 'Property UUID to report' })
  @ApiBody({ type: CreatePropertyReportDto })
  async create(
    @Param('propertyId') propertyId: string,
    @Body() dto: CreatePropertyReportDto,
    @CurrentUser() user: any
  ) {
    return this.service.create(propertyId, dto, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'List reports',
    description:
      'List all reports. Use filterByRole=true for role-based filtering. Use limit=0 for all records.'
  })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Use 0 for all records'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']
  })
  @ApiQuery({
    name: 'propertyId',
    required: false,
    description: 'Filter by specific property UUID'
  })
  @ApiQuery({
    name: 'reportType',
    required: false,
    enum: [
      'FAKE_LISTING',
      'INAPPROPRIATE_CONTENT',
      'WRONG_LOCATION',
      'OVERPRICED',
      'SPAM',
      'OTHER'
    ]
  })
  @ApiQuery({ name: 'severity', required: false, enum: [1, 2, 3, 4, 5] })
  @ApiQuery({
    name: 'filterByRole',
    required: false,
    type: Boolean,
    description: 'Enable role-based filtering (default: false)'
  })
  async list(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '0',
    @Query('status') status?: string,
    @Query('propertyId') propertyId?: string,
    @Query('reportType') reportType?: string,
    @Query('severity') severity?: string,
    @Query('filterByRole') filterByRole?: string
  ) {
    const filters = {
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: parseInt(limit, 10) ?? 10,
      status,
      propertyId,
      reportType,
      severity: severity ? parseInt(severity, 10) : undefined,
      filterByRole: filterByRole === 'true'
    };

    if (limit === '0') {
      filters.limit = 0;
    }

    return this.service.list(filters, user);
  }

  // NEW ENDPOINT
  @Get('my-property-reports')
  @ApiOperation({
    summary: 'Get reports on my properties',
    description:
      'Get all reports for properties owned/managed by current user. Use limit=0 for all records.'
  })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Use 0 for all records'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']
  })
  @ApiQuery({
    name: 'reportType',
    required: false,
    enum: [
      'FAKE_LISTING',
      'INAPPROPRIATE_CONTENT',
      'WRONG_LOCATION',
      'OVERPRICED',
      'SPAM',
      'OTHER'
    ]
  })
  @ApiQuery({ name: 'severity', required: false, enum: [1, 2, 3, 4, 5] })
  async getMyPropertyReports(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '0',
    @Query('status') status?: string,
    @Query('reportType') reportType?: string,
    @Query('severity') severity?: string
  ) {
    const filters = {
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: parseInt(limit, 10) ?? 10,
      status,
      reportType,
      severity: severity ? parseInt(severity, 10) : undefined
    };

    if (limit === '0') {
      filters.limit = 0;
    }

    return this.service.getMyPropertyReports(user.id, filters);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get report statistics',
    description: 'Get report stats. Use filterByRole=true for role-based stats.'
  })
  @ApiQuery({
    name: 'filterByRole',
    required: false,
    type: Boolean,
    description: 'Enable role-based filtering (default: false)'
  })
  @ApiResponse({
    status: 200,
    description: 'Report statistics retrieved successfully'
  })
  async stats(
    @CurrentUser() user: any,
    @Query('filterByRole') filterByRole?: string
  ) {
    return this.service.stats(user, filterByRole === 'true');
  }

  // NEW ENDPOINT
  @Get('by-property/:propertyId')
  @ApiOperation({
    summary: 'Get all reports for a specific property',
    description:
      'Get all reports for a property. Admin can access any. Owner/agent can access their own.'
  })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - no access to this property'
  })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiParam({ name: 'propertyId', description: 'Property UUID' })
  async getByProperty(
    @Param('propertyId') propertyId: string,
    @CurrentUser() user: any
  ) {
    return this.service.getByProperty(propertyId, user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get report details',
    description:
      'Get report details. Use checkAccess=true for role-based access check.'
  })
  @ApiResponse({
    status: 200,
    description: 'Report details retrieved successfully'
  })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiQuery({
    name: 'checkAccess',
    required: false,
    type: Boolean,
    description: 'Enable access check (default: false)'
  })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  async get(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('checkAccess') checkAccess?: string
  ) {
    return this.service.get(id, user, checkAccess === 'true');
  }

  @Put(':id/resolve')
  @ApiOperation({
    summary: 'Resolve a report',
    description:
      'Resolve a report. Use checkAdmin=true to restrict to admin only.'
  })
  @ApiResponse({ status: 200, description: 'Report resolved successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiParam({ name: 'id', description: 'Report UUID to resolve' })
  @ApiQuery({
    name: 'checkAdmin',
    required: false,
    type: Boolean,
    description: 'Restrict to admin only (default: false)'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resolution_notes: {
          type: 'string',
          example: 'Investigated and took appropriate action'
        },
        resolution_action: {
          type: 'string',
          example: 'PROPERTY_REMOVED',
          enum: [
            'PROPERTY_REMOVED',
            'PROPERTY_MODIFIED',
            'WARNING_ISSUED',
            'USER_SUSPENDED',
            'NO_ACTION'
          ]
        }
      }
    }
  })
  async resolve(
    @Param('id') id: string,
    @Body() body: { resolution_notes?: string; resolution_action?: string },
    @CurrentUser() user: any,
    @Query('checkAdmin') checkAdmin?: string
  ) {
    return this.service.resolve(
      id,
      user.id,
      body?.resolution_notes,
      body?.resolution_action,
      user,
      checkAdmin === 'true'
    );
  }

  @Put(':id/dismiss')
  @ApiOperation({
    summary: 'Dismiss a report',
    description:
      'Dismiss a report. Use checkAdmin=true to restrict to admin only.'
  })
  @ApiResponse({ status: 200, description: 'Report dismissed successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiParam({ name: 'id', description: 'Report UUID to dismiss' })
  @ApiQuery({
    name: 'checkAdmin',
    required: false,
    type: Boolean,
    description: 'Restrict to admin only (default: false)'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resolution_notes: {
          type: 'string',
          example: 'Insufficient evidence to take action'
        }
      }
    }
  })
  async dismiss(
    @Param('id') id: string,
    @Body() body: { resolution_notes?: string },
    @CurrentUser() user: any,
    @Query('checkAdmin') checkAdmin?: string
  ) {
    return this.service.dismiss(
      id,
      user.id,
      body?.resolution_notes,
      user,
      checkAdmin === 'true'
    );
  }
}
