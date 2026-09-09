import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Req,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody
} from '@nestjs/swagger';
import type { Request } from 'express';
import { NewsletterService } from './services/newsletter.service';
import { CreateNewsletterDto } from './dto/create-newsletter.dto';
import { NewsletterResponseDto } from './dto/newsletter-response.dto';
import { UpdateNewsletterStatusDto } from './dto/update-newsletter-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Newsletters')
@Controller('newsletters')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all newsletter subscriptions (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Newsletters retrieved successfully'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number (starting from 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Number of newsletters per page (1-100)'
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['ASC', 'DESC'],
    example: 'DESC',
    description: 'Sort order'
  })
  @ApiQuery({
    name: 'orderBy',
    required: false,
    example: 'created_at',
    description: 'Field to sort by (email, created_at, subscription_status, city, state, country)'
  })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'user@example.com',
    description: 'Search by email'
  })
  async getAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('sort') sort: 'ASC' | 'DESC' = 'DESC',
    @Query('orderBy') orderBy = 'created_at',
    @Query('search') search?: string
  ) {
    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const l = Math.max(1, Math.min(parseInt(String(limit), 10) || 10, 100));
    return this.newsletterService.getAll(p, l, sort, orderBy, search);
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Subscribe to newsletter (public endpoint)' })
  @ApiResponse({
    status: 201,
    description: 'Successfully subscribed to newsletter',
    type: NewsletterResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Already subscribed' })
  async create(
    @Body() dto: CreateNewsletterDto,
    @Req() req: any
  ): Promise<NewsletterResponseDto> {
    const ipAddress = this.getClientIp(req);
    return this.newsletterService.create(dto, ipAddress);
  }

  @Patch('subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Subscribe to newsletter (change status to subscribed)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully subscribed',
    type: NewsletterResponseDto
  })
  @ApiResponse({ status: 400, description: 'Already subscribed' })
  @ApiResponse({ status: 404, description: 'Newsletter subscription not found' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          example: '123e4567-e89b-12d3-a456-426614174000'
        }
      },
      required: ['id']
    }
  })
  async subscribe(@Body() dto: UpdateNewsletterStatusDto): Promise<NewsletterResponseDto> {
    return this.newsletterService.subscribeNewsLetter(dto.id);
  }

  @Patch('unsubscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unsubscribe from newsletter (change status to unsubscribed)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully unsubscribed',
    type: NewsletterResponseDto
  })
  @ApiResponse({ status: 400, description: 'Already unsubscribed' })
  @ApiResponse({ status: 404, description: 'Newsletter subscription not found' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          example: '123e4567-e89b-12d3-a456-426614174000'
        }
      },
      required: ['id']
    }
  })
  async unsubscribe(@Body() dto: UpdateNewsletterStatusDto): Promise<NewsletterResponseDto> {
    return this.newsletterService.unsubscribeNewsLetter(dto.id);
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get newsletter subscription analytics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        grandTotal: { type: 'number', description: 'Total number of all subscriptions' },
        today: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of subscriptions today' },
            growthPercentage: { type: 'number', description: 'Growth percentage compared to yesterday' },
          },
        },
        thisWeek: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of subscriptions this week' },
            growthPercentage: { type: 'number', description: 'Growth percentage compared to last week' },
          },
        },
        thisMonth: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of subscriptions this month' },
            growthPercentage: { type: 'number', description: 'Growth percentage compared to last month' },
          },
        },
      },
    },
  })
  async getAnalytics() {
    return this.newsletterService.getAnalytics();
  }

  private getClientIp(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return req.ip || req.socket?.remoteAddress || '';
  }
}

