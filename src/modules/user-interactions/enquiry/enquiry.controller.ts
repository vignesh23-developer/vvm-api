import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiResponse
} from '@nestjs/swagger';
import { EnquiryService } from './services/enquiry.service';
import { CreateEnquiryDto } from './dto';
import { EntityType } from '../../search/saved-search/dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('User Interactions - Enquiries')
@Controller('user-interactions/enquiries')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class EnquiryController {
  constructor(private readonly enquiryService: EnquiryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new enquiry' })
  @ApiBody({ type: CreateEnquiryDto })
  @ApiResponse({ status: 201, description: 'Enquiry created successfully' })
  async create(
    @Body() createEnquiryDto: CreateEnquiryDto,
    @CurrentUser() user: any
  ) {
    return this.enquiryService.create(createEnquiryDto, user?.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all enquiries',
    description:
      'List all enquiries. Use filterByRole=true for role-based filtering. Use limit=0 for all records.'
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Use 0 for all records'
  })
  @ApiQuery({ name: 'entity_type', required: false, enum: EntityType })
  @ApiQuery({
    name: 'entity_id',
    required: false,
    description: 'Filter by specific property/ad UUID'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['new', 'read', 'responded', 'closed']
  })
  @ApiQuery({
    name: 'filterByRole',
    required: false,
    type: Boolean,
    description: 'Enable role-based filtering (default: false)'
  })
  @ApiResponse({ status: 200, description: 'Enquiries retrieved successfully' })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '0',
    @Query('entity_type') entityType?: EntityType,
    @Query('entity_id') entityId?: string,
    @Query('status') status?: string,
    @Query('filterByRole') filterByRole?: string
  ) {
    const filters = {
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: parseInt(limit, 10) ?? 10,
      entityType,
      entityId,
      status,
      filterByRole: filterByRole === 'true'
    };

    if (limit === '0') {
      filters.limit = 0;
    }

    return this.enquiryService.findAll(filters, user);
  }

  @Get('my-enquiries')
  @ApiOperation({
    summary: 'Get current user enquiries',
    description:
      'Get enquiries submitted by the logged-in user. Use limit=0 for all records.'
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Use 0 for all records'
  })
  @ApiQuery({ name: 'entity_type', required: false, enum: EntityType })
  @ApiResponse({
    status: 200,
    description: 'User enquiries retrieved successfully'
  })
  async findMyEnquiries(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '0',
    @Query('entity_type') entityType?: EntityType
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    let l = parseInt(limit, 10) ?? 10;

    if (limit === '0') {
      l = 0;
    }

    return this.enquiryService.findByUser(user.id, p, l, entityType);
  }

  // NEW ENDPOINT
  @Get('my-received-enquiries')
  @ApiOperation({
    summary: 'Get enquiries received on my properties/ads',
    description:
      'Get all enquiries for properties/ads owned by current user. Use limit=0 for all records.'
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Use 0 for all records'
  })
  @ApiQuery({ name: 'entity_type', required: false, enum: EntityType })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['new', 'read', 'responded', 'closed']
  })
  @ApiResponse({
    status: 200,
    description: 'Received enquiries retrieved successfully'
  })
  async getMyReceivedEnquiries(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '0',
    @Query('entity_type') entityType?: EntityType,
    @Query('status') status?: string
  ) {
    const filters = {
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: parseInt(limit, 10) ?? 10,
      entityType,
      status
    };

    if (limit === '0') {
      filters.limit = 0;
    }

    return this.enquiryService.getMyReceivedEnquiries(user.id, filters);
  }

  // NEW ENDPOINT
  @Get('stats')
  @ApiOperation({
    summary: 'Get enquiry statistics',
    description:
      'Get enquiry stats. Use filterByRole=true for role-based stats.'
  })
  @ApiQuery({
    name: 'filterByRole',
    required: false,
    type: Boolean,
    description: 'Enable role-based filtering (default: false)'
  })
  @ApiResponse({
    status: 200,
    description: 'Enquiry statistics retrieved successfully'
  })
  async getStats(
    @CurrentUser() user: any,
    @Query('filterByRole') filterByRole?: string
  ) {
    return this.enquiryService.getStats(user, filterByRole === 'true');
  }

  @Get('by-entity/:entity_type/:entity_id')
  @ApiOperation({
    summary: 'Get enquiries for a specific entity',
    description:
      'Get enquiries for a property/ad. Use checkAccess=true for access validation.'
  })
  @ApiParam({ name: 'entity_type', enum: EntityType, example: 'property' })
  @ApiParam({
    name: 'entity_id',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Use 0 for all records'
  })
  @ApiQuery({
    name: 'checkAccess',
    required: false,
    type: Boolean,
    description: 'Enable access check (default: false)'
  })
  @ApiResponse({ status: 200, description: 'Enquiries retrieved successfully' })
  async findByEntity(
    @CurrentUser() user: any,
    @Param('entity_type') entityType: EntityType,
    @Param('entity_id') entityId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '0',
    @Query('checkAccess') checkAccess?: string
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    let l = Math.max(0, Math.min(parseInt(limit, 10) || 10, 50));

    if (limit === '0') {
      l = 0;
    }

    return this.enquiryService.findByEntity(
      entityType,
      entityId,
      p,
      l,
      user,
      checkAccess === 'true'
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get enquiry by ID',
    description:
      'Get enquiry details. Use checkAccess=true for access validation.'
  })
  @ApiParam({ name: 'id', description: 'Enquiry UUID' })
  @ApiQuery({
    name: 'checkAccess',
    required: false,
    type: Boolean,
    description: 'Enable access check (default: false)'
  })
  @ApiResponse({ status: 200, description: 'Enquiry retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Enquiry not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('checkAccess') checkAccess?: string
  ) {
    return this.enquiryService.findOne(id, user, checkAccess === 'true');
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update enquiry status',
    description: 'Update status. Use checkAccess=true to validate ownership.'
  })
  @ApiParam({ name: 'id', description: 'Enquiry UUID' })
  @ApiQuery({
    name: 'checkAccess',
    required: false,
    type: Boolean,
    description: 'Enable access check (default: false)'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['new', 'read', 'responded', 'closed'],
          example: 'responded'
        }
      },
      required: ['status']
    }
  })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 404, description: 'Enquiry not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: any,
    @Query('checkAccess') checkAccess?: string
  ) {
    return this.enquiryService.updateStatus(
      id,
      status,
      user,
      checkAccess === 'true'
    );
  }
}
