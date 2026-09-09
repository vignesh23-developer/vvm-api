import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserSubscriptionService } from './services/user-subscription.service';
import { SubscriptionFeatureService } from '../subscription-feature/services/subscription-feature.service';
import {
  CreateAddonOrderDto,
  CreateSubscriptionOrderDto,
  VerifyPaymentDto,
  PurchaseAddonDto,
  RecordFeatureUsageDto,
  SubscribeUserDto,
  UpdateUserSubscriptionDto
} from './dto/user-subscription.dto';
import { RazorpayBillingService } from './services/razorpay-billing.service';
import { CurrentUser } from 'src/modules/auth';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@ApiTags('user-subscriptions')
@Controller()
export class UserSubscriptionController {
  constructor(
    private readonly userSubService: UserSubscriptionService,
    private readonly razorpayBilling: RazorpayBillingService,
    private readonly featureService: SubscriptionFeatureService
  ) { }

  @Get('users/:userId/subscription')
  @ApiOperation({ summary: "Get user's active subscription" })
  @ApiParam({ name: 'userId', example: 101 })
  async active(@Param('userId') userId: string) {
    return this.userSubService.getActive(userId);
  }

  @Get('users/:userId/subscriptions')
  @ApiOperation({ summary: "Get user's active subscription" })
  @ApiParam({ name: 'userId', example: 101 })
  async all(@Param('userId') userId: string) {
    return this.userSubService.getUserAll(userId);
  }

  @Get('users/subscriptions/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: "Get all user subscriptions (Admin only)" })
  @ApiResponse({ status: 200, description: "Subscriptions retrieved successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized – Invalid or missing JWT token" })
  @ApiResponse({ status: 403, description: "Forbidden – Only admins can access this route" })
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
    description: 'Items per page (1–100)'
  })
  @ApiQuery({
    name: 'orderBy',
    required: false,
    example: 'createdAt',
    description: 'Sort field (createdAt, updatedAt, status, startDate, endDate)'
  })
  @ApiQuery({
    name: 'order',
    required: false,
    example: 'DESC',
    description: 'Sort direction (ASC or DESC)'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    example: 'active',
    description: 'Filter by subscription status: active | inactive | all'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    example: '2024-01-01',
    description: 'Filter: subscriptions from this date (inclusive)'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    example: '2024-12-31',
    description: 'Filter: subscriptions until this date (inclusive)'
  })
  @ApiQuery({
    name: 'planId',
    required: false,
    example: 1,
    description: 'Filter by subscription plan ID'
  })
  async adminAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('orderBy') orderBy: string = 'startDate',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('status') status: string = 'all',
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('planId') planId: string,
    @CurrentUser() user: any,
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1)
    const limitNum = Math.max(1, Math.min(parseInt(String(limit), 10) || 10, 100))
    const planIdNum = planId ? parseInt(String(planId), 10) : undefined

    return this.userSubService.getAll({
      roles: user.roles,
      page: pageNum,
      limit: limitNum,
      orderBy,
      order,
      status,
      startDate,
      endDate,
      planId: planIdNum
    });
  }

  @Get('users/subscriptions/analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get subscription plan analytics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Plan analytics retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          plan_id: { type: 'number' },
          plan_name: { type: 'string' },
          plan_price: { type: 'number' },
          total_subscriptions: { type: 'number' },
          active_subscriptions: { type: 'number' },
          expired_subscriptions: { type: 'number' },
          total_revenue: { type: 'number' },
          growth: {
            type: 'object',
            properties: {
              today: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                  growthPercentage: { type: 'number' },
                },
              },
              thisWeek: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                  growthPercentage: { type: 'number' },
                },
              },
              thisMonth: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                  growthPercentage: { type: 'number' },
                },
              },
              thisYear: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                  growthPercentage: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async getPlanAnalytics() {
    return this.userSubService.getPlanAnalytics();
  }



  @Post('users/:userId/subscription/:id/cancel')
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiParam({ name: 'id', example: 42 })
  @ApiBody({
    description: 'Optional cancellation reason',
    examples: {
      sample: { value: { reason: 'No longer needed' } }
    }
  })
  async cancel(
    @Param('userId') userId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string }
  ) {
    return this.userSubService.cancel(userId, Number(id), body?.reason);
  }

  @Post('users/:userId/subscribe/verify')
  @ApiOperation({ summary: 'Verify Subscription Payment' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiBody({ type: VerifyPaymentDto })
  async verifySubscription(
    @Param('userId') userId: string,
    @Body() dto: VerifyPaymentDto
  ) {
    return this.userSubService.verifySubscription(dto);
  }

  // ────────────────────────────────────────────────────────────────
  // 2) CREATE ORDER FOR INITIAL SUBSCRIBE
  // ────────────────────────────────────────────────────────────────

  @Post('users/:userId/subscribe/order')
  @ApiOperation({ summary: 'Create Subscription Order (Initial Subscribe)' })
  async createSubscriptionOrder(
    @Param('userId') userId: string,
    @Body() dto: CreateSubscriptionOrderDto
  ) {
    return this.userSubService.createSubscriptionOrder(userId, dto.plan_id);
  }

  // ────────────────────────────────────────────────────────────────
  // 3) UPGRADE ORDER
  // ────────────────────────────────────────────────────────────────

  @Post('users/:userId/subscription/:subscriptionId/upgrade/order')
  @ApiOperation({ summary: 'Create Upgrade Order' })
  async createUpgradeOrder(
    @Param('userId') userId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: { newPlanId: number }
  ) {

    return this.userSubService.createUpgradeOrder(
      userId,
      Number(subscriptionId),
      body.newPlanId
    );
  }
  // ────────────────────────────────────────────────────────────────
  // 4) DOWNGRADE ORDER (IMMEDIATE ONLY)
  // ────────────────────────────────────────────────────────────────

  @Post('users/:userId/subscription/:subscriptionId/downgrade/order')
  @ApiOperation({ summary: 'Create Downgrade Order (Immediate)' })
  async createDowngradeOrder(
    @Param('userId') userId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: { newPlanId: number; }
  ) {
    return this.userSubService.createDowngradeOrder(
      userId,
      Number(subscriptionId),
      body.newPlanId
    );
  }

  @Post('users/:userId/add-ons')
  @ApiOperation({ summary: 'Purchase add-on' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiBody({
    type: PurchaseAddonDto,
    examples: {
      sample: {
        summary: 'Purchase boost',
        value: {
          item_id: 10,
          userSubscription_id: 42,
          startDate: '2025-10-05T00:00:00.000Z',
          endDate: '2025-10-12T00:00:00.000Z',
          paidAmount: 499.0,
          paymentStatus: 'Paid',
          transactionId: 'pay_xyz789',
          appliedTo: 'property_123'
        }
      }
    }
  })
  async purchaseAddon(
    @Param('userId') userId: string,
    @Body() dto: PurchaseAddonDto
  ) {
    return this.userSubService.purchaseAddon(userId, dto);
  }

  @Post('users/:userId/addons/order')
  @ApiOperation({ summary: 'Create Add-on Order' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiBody({ type: CreateAddonOrderDto })
  async createAddonOrder(
    @Param('userId') userId: string,
    @Body() dto: CreateAddonOrderDto
  ) {
    return this.userSubService.createAddonOrder(userId, dto.item_id, dto.quantity);
  }

  @Post('users/:userId/addons/verify')
  @ApiOperation({ summary: 'Verify Add-on Payment' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiBody({ type: VerifyPaymentDto })
  async verifyAddon(
    @Param('userId') userId: string,
    @Body() dto: VerifyPaymentDto
  ) {
    return this.userSubService.verifyAddon(userId, dto);
  }

  @Get('users/:userId/add-ons')
  @ApiOperation({ summary: "Get user's add-ons" })
  @ApiParam({ name: 'userId', example: 101 })
  async addons(@Param('userId') userId: string) {
    return this.userSubService.listAddons(userId);
  }

  @Get('users/:userId/features/:featureName/access')
  @ApiOperation({ summary: 'Check feature access' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiParam({ name: 'featureName', example: 'Video Upload' })
  async access(
    @Param('userId') userId: string,
    @Param('featureName') featureName: string
  ) {
    const hasAccess = await this.featureService.userHasFeatureAccess(
      userId,
      featureName
    );
    return { success: true, data: { hasAccess } };
  }

  @Get('users/:userId/features/usage')
  @ApiOperation({ summary: 'Get feature usage' })
  @ApiParam({ name: 'userId', example: 101 })
  async usage(@Param('userId') userId: string) {
    const data = await this.featureService.getUsage(userId);
    return { success: true, data };
  }

  @Post('users/:userId/features/:featureName/usage')
  @ApiOperation({ summary: 'Record feature usage' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiParam({ name: 'featureName', example: 'Property Listings' })
  @ApiBody({
    type: RecordFeatureUsageDto,
    examples: { sample: { value: { usageCount: 1, usageValue: 0 } } }
  })
  async recordUsage(
    @Param('userId') userId: string,
    @Param('featureName') featureName: string,
    @Body() body: RecordFeatureUsageDto
  ) {
    const ok = await this.featureService.recordFeatureUsage(
      userId,
      featureName,
      body?.usageCount ?? 1,
      body?.usageValue ?? 0
    );
    return { success: ok };
  }

  // ⚠️ TESTING ONLY - REMOVE BEFORE PRODUCTION ⚠️
  @Delete('users/:userId/subscription/delete')
  @ApiOperation({ summary: '[TESTING ONLY] Delete user subscriptions' })
  @ApiParam({ name: 'userId', example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a' })
  async deleteUserSubscriptions(@Param('userId') userId: string) {
    return this.userSubService.deleteUserSubscription(userId);
  }
}
