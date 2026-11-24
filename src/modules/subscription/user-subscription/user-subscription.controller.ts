import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { UserSubscriptionService } from './services/user-subscription.service';

import { SubscriptionFeatureService } from '../subscription-feature/services/subscription-feature.service';

import {
  CreateAddonOrderDto,
  CreateSubscriptionOrderDto,
  VerifyPaymentDto,
  PurchaseAddonDto,
  RecordFeatureUsageDto,
} from './dto/user-subscription.dto';

import { CurrentUser } from 'src/modules/auth';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

import { Roles } from 'src/modules/auth/decorators/roles.decorator';

import { RolesGuard } from 'src/modules/auth/guards/roles.guard';

@ApiTags('user-subscriptions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class UserSubscriptionController {
  constructor(
    private readonly userSubService: UserSubscriptionService,
    private readonly featureService: SubscriptionFeatureService,
  ) { }

  /**
   * Verify that the authenticated user owns the requested user's resources.
   *
   * Subscription endpoints are owner-only.
   * Admin privileges are handled separately for explicitly admin-only endpoints.
   */
  private assertUserOwnership(
    requestedUserId: string,
    currentUser: { id?: string; sub?: string },
  ): void {
    const authenticatedUserId = currentUser?.id ?? currentUser?.sub;

    if (!authenticatedUserId) {
      throw new ForbiddenException('Authenticated user information is missing');
    }

    if (authenticatedUserId !== requestedUserId) {
      throw new ForbiddenException(
        'You can access only your own subscription',
      );
    }
  }

  // ---------------------------------------------------------
  // SUBSCRIPTION ACCESS STATUS
  // ---------------------------------------------------------

  @Get('users/:userId/subscription-access')
  @ApiOperation({ summary: 'Get free-trial/subscription access status' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  async accessStatus(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return {
      success: true,
      data: await this.featureService.getAccessStatus(userId),
    };
  }

  // ---------------------------------------------------------
  // GET ACTIVE SUBSCRIPTION
  // ---------------------------------------------------------

  @Get('users/:userId/subscription')
  @ApiOperation({ summary: "Get user's active subscription" })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  async active(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.getActive(userId);
  }

  // ---------------------------------------------------------
  // GET ALL SUBSCRIPTIONS FOR THE AUTHENTICATED USER
  // ---------------------------------------------------------

  @Get('users/:userId/subscriptions')
  @ApiOperation({ summary: "Get user's subscriptions" })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  async all(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.getUserAll(userId);
  }

  // ---------------------------------------------------------
  // ADMIN: GET ALL USER SUBSCRIPTIONS
  // ---------------------------------------------------------

  @Get('users/subscriptions/all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all user subscriptions (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Subscriptions retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number starting from 1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Items per page, between 1 and 100',
  })
  @ApiQuery({
    name: 'orderBy',
    required: false,
    example: 'createdAt',
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    example: 'DESC',
    description: 'Sort direction: ASC or DESC',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    example: 'all',
    description: 'Subscription status: active, inactive, or all',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    example: '2024-01-01',
    description: 'Filter subscriptions from this date',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    example: '2024-12-31',
    description: 'Filter subscriptions until this date',
  })
  @ApiQuery({
    name: 'planId',
    required: false,
    example: 1,
    description: 'Filter by subscription plan ID',
  })
  async adminAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('orderBy') orderBy: string = 'startDate',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('status') status: string = 'all',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('planId') planId?: string,
    @CurrentUser() user?: any,
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);

    const limitNum = Math.max(
      1,
      Math.min(parseInt(String(limit), 10) || 10, 100),
    );

    const planIdNum = planId
      ? parseInt(String(planId), 10)
      : undefined;

    if (planId && (!Number.isInteger(planIdNum) || planIdNum! <= 0)) {
      throw new ForbiddenException('Invalid plan ID');
    }

    return this.userSubService.getAll({
      roles: user?.roles ?? [],
      page: pageNum,
      limit: limitNum,
      orderBy,
      order,
      status,
      startDate,
      endDate,
      planId: planIdNum,
    });
  }

  // ---------------------------------------------------------
  // ADMIN: SUBSCRIPTION ANALYTICS
  // ---------------------------------------------------------

  @Get('users/subscriptions/analytics')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get subscription plan analytics (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Plan analytics retrieved successfully',
  })

  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async getPlanAnalytics() {
    return this.userSubService.getPlanAnalytics();
  }

  // ---------------------------------------------------------
  // CANCEL SUBSCRIPTION
  // ---------------------------------------------------------

  @Post('users/:userId/subscription/:id/cancel')
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  @ApiParam({ name: 'id', example: 42 })
  @ApiBody({
    description: 'Optional cancellation reason',
    examples: {
      sample: {
        value: { reason: 'No longer needed' },
      },
    },
  })
  async cancel(
    @Param('userId') userId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    const subscriptionId = Number(id);

    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
      throw new ForbiddenException('Invalid subscription ID');
    }

    return this.userSubService.cancel(
      userId,
      subscriptionId,
      body?.reason,
    );
  }

  // ---------------------------------------------------------
  // VERIFY SUBSCRIPTION PAYMENT
  // ---------------------------------------------------------

  @Post('users/:userId/subscribe/verify')
  @ApiOperation({ summary: 'Verify subscription payment' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  @ApiBody({ type: VerifyPaymentDto })
  async verifySubscription(
    @Param('userId') userId: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.verifySubscription(dto);
  }

  // ---------------------------------------------------------
  // CREATE INITIAL SUBSCRIPTION ORDER
  // ---------------------------------------------------------

  @Post('users/:userId/subscribe/order')
  @ApiOperation({ summary: 'Create subscription order' })
  async createSubscriptionOrder(
    @Param('userId') userId: string,
    @Body() dto: CreateSubscriptionOrderDto,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.createSubscriptionOrder(
      userId,
      dto.plan_id,
    );
  }

  // ---------------------------------------------------------
  // CREATE UPGRADE ORDER
  // ---------------------------------------------------------

  @Post('users/:userId/subscription/:subscriptionId/upgrade/order')
  @ApiOperation({ summary: 'Create upgrade order' })
  async createUpgradeOrder(
    @Param('userId') userId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: { newPlanId: number },
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    const id = Number(subscriptionId);

    if (!Number.isInteger(id) || id <= 0) {
      throw new ForbiddenException('Invalid subscription ID');
    }

    return this.userSubService.createUpgradeOrder(
      userId,
      id,
      body.newPlanId,
    );
  }

  // ---------------------------------------------------------
  // CREATE DOWNGRADE ORDER
  // ---------------------------------------------------------

  @Post('users/:userId/subscription/:subscriptionId/downgrade/order')
  @ApiOperation({ summary: 'Create downgrade order' })
  async createDowngradeOrder(
    @Param('userId') userId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: { newPlanId: number },
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    const id = Number(subscriptionId);

    if (!Number.isInteger(id) || id <= 0) {
      throw new ForbiddenException('Invalid subscription ID');
    }

    return this.userSubService.createDowngradeOrder(
      userId,
      id,
      body.newPlanId,
    );
  }

  // ---------------------------------------------------------
  // PURCHASE ADD-ON
  // ---------------------------------------------------------

  @Post('users/:userId/add-ons')
  @ApiOperation({ summary: 'Purchase add-on' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  @ApiBody({
    type: PurchaseAddonDto,
    examples: {
      sample: {

        value: {
          item_id: 10,
          userSubscription_id: 42,
          startDate: '2025-10-05T00:00:00.000Z',
          endDate: '2025-10-12T00:00:00.000Z',
          paidAmount: 499.0,
          paymentStatus: 'Paid',
          transactionId: 'pay_xyz789',
          appliedTo: 'property_123',
        },
      },
    },
  })
  async purchaseAddon(
    @Param('userId') userId: string,
    @Body() dto: PurchaseAddonDto,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.purchaseAddon(userId, dto);
  }

  // ---------------------------------------------------------
  // CREATE ADD-ON ORDER
  // ---------------------------------------------------------

  @Post('users/:userId/addons/order')
  @ApiOperation({ summary: 'Create add-on order' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  @ApiBody({ type: CreateAddonOrderDto })
  async createAddonOrder(
    @Param('userId') userId: string,
    @Body() dto: CreateAddonOrderDto,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.createAddonOrder(
      userId,
      dto.item_id,
      dto.quantity,
    );
  }

  // ---------------------------------------------------------
  // VERIFY ADD-ON PAYMENT
  // ---------------------------------------------------------

  @Post('users/:userId/addons/verify')
  @ApiOperation({ summary: 'Verify add-on payment' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  @ApiBody({ type: VerifyPaymentDto })
  async verifyAddon(
    @Param('userId') userId: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.verifyAddon(userId, dto);
  }

  // ---------------------------------------------------------
  // GET USER ADD-ONS
  // ---------------------------------------------------------

  @Get('users/:userId/add-ons')
  @ApiOperation({ summary: "Get user's add-ons" })
  async addons(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    return this.userSubService.listAddons(userId);
  }

  // ---------------------------------------------------------
  // CHECK FEATURE ACCESS
  // ---------------------------------------------------------

  @Get('users/:userId/features/:featureName/access')
  @ApiOperation({ summary: 'Check feature access' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  @ApiParam({
    name: 'featureName',
    example: 'Property Listings',
  })
  async access(
    @Param('userId') userId: string,
    @Param('featureName') featureName: string,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    const hasAccess = await this.featureService.userHasFeatureAccess(
      userId,
      featureName,
    );

    return {
      success: true,
      data: { hasAccess },
    };
  }

  // ---------------------------------------------------------
  // GET FEATURE USAGE
  // ---------------------------------------------------------

  @Get('users/:userId/features/usage')
  @ApiOperation({ summary: 'Get feature usage' })
  async usage(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    const data = await this.featureService.getUsage(userId);

    return {
      success: true,
      data,
    };
  }

  // ---------------------------------------------------------
  // RECORD FEATURE USAGE
  // ---------------------------------------------------------

  @Post('users/:userId/features/:featureName/usage')
  @ApiOperation({ summary: 'Record feature usage' })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  @ApiParam({
    name: 'featureName',
    example: 'Property Listings',
  })
  @ApiBody({
    type: RecordFeatureUsageDto,
    examples: {
      sample: {
        value: {
          usageCount: 1,
          usageValue: 0,
        },
      },
    },
  })
  async recordUsage(
    @Param('userId') userId: string,
    @Param('featureName') featureName: string,
    @Body() body: RecordFeatureUsageDto,
    @CurrentUser() user: any,
  ) {
    this.assertUserOwnership(userId, user);

    const ok = await this.featureService.recordFeatureUsage(
      userId,
      featureName,
      body?.usageCount ?? 1,
      body?.usageValue ?? 0,
    );

    return { success: ok };
  }

  // ---------------------------------------------------------
  // ADMIN-ONLY TESTING ENDPOINT
  // Remove this endpoint before production if no longer needed.
  // ---------------------------------------------------------

  @Delete('users/:userId/subscription/delete')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: '[TESTING ONLY] Delete user subscriptions (Admin only)',
  })
  @ApiParam({
    name: 'userId',
    example: 'b8cf8013-36e9-4d85-a31b-10090ad6438a',
  })
  async deleteUserSubscriptions(
    @Param('userId') userId: string,
  ) {
    return this.userSubService.deleteUserSubscription(userId);
  }
}
