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
import { AdReportService } from './services/ad-report.service';
import {
  CreateAdReportDto,
  ResolveAdReportDto,
  DismissAdReportDto
} from './dto/create-report.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';

@ApiTags('Ad Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('ad-reports')
export class AdReportController {
  constructor(private readonly service: AdReportService) {}

  @Post(':adId')
  @ApiOperation({ summary: 'Report an ad' })
  @ApiResponse({ status: 201, description: 'Ad report created successfully' })
  @ApiResponse({ status: 404, description: 'Ad not found' })
  @ApiResponse({ status: 400, description: 'Invalid report data' })
  @ApiParam({
    name: 'adId',
    example: '22222222-2222-2222-2222-222222222222',
    description: 'Ad UUID to report'
  })
  @ApiBody({ type: CreateAdReportDto })
  async create(
    @Param('adId') adId: string,
    @Body() dto: CreateAdReportDto,
    @CurrentUser() user: any
  ) {
    return this.service.create(adId, dto, user?.id);
  }

  // EXISTING ENDPOINT - Backward compatible
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
    name: 'adId',
    required: false,
    description: 'Filter by specific ad UUID'
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
    @Query('adId') adId?: string,
    @Query('reportType') reportType?: string,
    @Query('severity') severity?: string,
    @Query('filterByRole') filterByRole?: string
  ) {
    const filters = {
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: parseInt(limit, 10) ?? 10,
      status,
      adId,
      reportType,
      severity: severity ? parseInt(severity, 10) : undefined,
      filterByRole: filterByRole === 'true'
    };

    // Handle limit = 0 explicitly
    if (limit === '0') {
      filters.limit = 0;
    }

    return this.service.list(filters, user);
  }

  // NEW ENDPOINT - Agent's ad reports
  @Get('my-ad-reports')
  @ApiOperation({
    summary: 'Get reports on my ads',
    description:
      'Get all reports for ads owned by the current user. Use limit=0 for all records.'
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
  async getMyAdReports(
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

    return this.service.getMyAdReports(user.id, filters);
  }

  // EXISTING ENDPOINT - Backward compatible
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

  // NEW ENDPOINT - Get reports for specific ad
  @Get('by-ad/:adId')
  @ApiOperation({
    summary: 'Get all reports for a specific ad',
    description:
      'Get all reports for an ad. Admin can access any. Owner can access their own.'
  })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - no access to this ad' })
  @ApiResponse({ status: 404, description: 'Ad not found' })
  @ApiParam({ name: 'adId', description: 'Ad UUID' })
  async getByAd(@Param('adId') adId: string, @CurrentUser() user: any) {
    return this.service.getByAd(adId, user);
  }

  // EXISTING ENDPOINT - Backward compatible
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

  // EXISTING ENDPOINT - Backward compatible
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
  @ApiBody({ type: ResolveAdReportDto })
  async resolve(
    @Param('id') id: string,
    @Body() body: ResolveAdReportDto,
    @CurrentUser() user: any,
    @Query('checkAdmin') checkAdmin?: string
  ) {
    const reviewerId = body?.reviewer_id || user?.id;
    return this.service.resolve(
      id,
      reviewerId,
      body?.resolution_notes,
      body?.resolution_action,
      user,
      checkAdmin === 'true'
    );
  }

  // EXISTING ENDPOINT - Backward compatible
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
  @ApiBody({ type: DismissAdReportDto })
  async dismiss(
    @Param('id') id: string,
    @Body() body: DismissAdReportDto,
    @CurrentUser() user: any,
    @Query('checkAdmin') checkAdmin?: string
  ) {
    const reviewerId = body?.reviewer_id || user?.id;
    return this.service.dismiss(
      id,
      reviewerId,
      body?.resolution_notes,
      user,
      checkAdmin === 'true'
    );
  }
}
