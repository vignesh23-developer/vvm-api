import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
  Req
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam
} from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificationService } from '../services/notification.service';
import { PreferenceService } from '../services/preference.service';
import { QuotaService } from '../services/quota.service';
import { EventEmitterService } from '../services/event-emitter.service';
import {
  NotificationFilterDto,
  MarkAsReadDto,
  UpdatePreferenceDto,
  BulkChannelPreferenceDto,
  QuietHoursDto,
  NotificationListResponseDto,
  QuotaSummaryResponseDto
} from '../dto';
import {
  NotificationCategory,
  NotificationChannel
} from '../enums/notification.enum';
import { BadgeCountsResponseDto } from '../dto/badge.dto';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly preferenceService: PreferenceService,
    private readonly quotaService: QuotaService,
    private readonly eventEmitterService: EventEmitterService
  ) {}

  // ============================================
  // GET NOTIFICATIONS
  // ============================================

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiResponse({ status: 200, type: NotificationListResponseDto })
  async getNotifications(
    @CurrentUser() user: { id: string },
    @Query() filter: NotificationFilterDto
  ) {
    const result = await this.notificationService.getUserNotifications(
      user.id,
      {
        page: filter.page,
        limit: filter.limit,
        category: filter.category,
        unreadOnly: filter.unreadOnly
      }
    );

    return {
      ...result,
      page: filter.page || 1,
      limit: filter.limit || 20
    };
  }

  // ============================================
  // GET UNREAD COUNT
  // ============================================

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: { id: string }) {
    const count = await this.notificationService.getUnreadCount(user.id);
    return { unreadCount: count };
  }

  // ============================================
  // SSE STREAM
  // ============================================

  @Get('sse/stream')
  @ApiOperation({
    summary: 'Establish SSE connection for real-time notifications'
  })
  @ApiResponse({ status: 200, description: 'SSE stream established' })
  async stream(
    @CurrentUser() user: { id: string },
    @Res() response: Response,
    @Req() request: Request
  ) {
    // Register SSE connection (this sets up headers and sends initial connected message)
    this.eventEmitterService.registerConnection(user.id, response);

    // Keep connection alive with heartbeat
    const heartbeatInterval = setInterval(() => {
      try {
        if (!response.writableEnded && !response.destroyed) {
          // Send heartbeat directly to this connection
          response.write(`event: heartbeat\n`);
          response.write(
            `data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`
          );
          if (typeof (response as any).flush === 'function') {
            (response as any).flush();
          }
        } else {
          clearInterval(heartbeatInterval);
        }
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000); // Every 30 seconds

    // Cleanup on disconnect
    request.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    // Keep the connection open
    // The response will remain open until the client disconnects
  }

  // ============================================
  // MARK AS READ
  // ============================================

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async markAsRead(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) notificationId: string
  ) {
    const success = await this.notificationService.markAsRead(
      notificationId,
      user.id
    );
    return { success };
  }

  @Post('mark-read')
  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  async markMultipleAsRead(
    @CurrentUser() user: { id: string },
    @Body() dto: MarkAsReadDto
  ) {
    let count = 0;
    for (const id of dto.notificationIds) {
      const success = await this.notificationService.markAsRead(id, user.id);
      if (success) count++;
    }
    return { success: true, markedCount: count };
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser() user: { id: string }) {
    const count = await this.notificationService.markAllAsRead(user.id);
    return { success: true, markedCount: count };
  }

  // ============================================
  // DELETE NOTIFICATIONS
  // ============================================

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async deleteNotification(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) notificationId: string
  ) {
    const success = await this.notificationService.deleteNotification(
      notificationId,
      user.id
    );
    return { success };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all notifications' })
  async deleteAllNotifications(@CurrentUser() user: { id: string }) {
    const count = await this.notificationService.deleteAllNotifications(
      user.id
    );
    return { success: true, deletedCount: count };
  }

  // ============================================
  // PREFERENCES
  // ============================================

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@CurrentUser() user: { id: string }) {
    const preferences = await this.preferenceService.getUserPreferences(
      user.id
    );
    return { preferences };
  }

  @Get('preferences/:category')
  @ApiOperation({ summary: 'Get preference for specific category' })
  @ApiParam({ name: 'category', enum: NotificationCategory })
  async getPreferenceByCategory(
    @CurrentUser() user: { id: string },
    @Param('category') category: NotificationCategory
  ) {
    const preference = await this.preferenceService.getOrCreatePreference(
      user.id,
      category
    );
    return { preference };
  }

  @Patch('preferences/:category')
  @ApiOperation({ summary: 'Update preference for category' })
  @ApiParam({ name: 'category', enum: NotificationCategory })
  async updatePreference(
    @CurrentUser() user: { id: string },
    @Param('category') category: NotificationCategory,
    @Body() dto: UpdatePreferenceDto
  ) {
    const preference = await this.preferenceService.updatePreference(
      user.id,
      category,
      dto
    );
    return { preference };
  }

  @Post('preferences/bulk-channel')
  @ApiOperation({ summary: 'Enable/disable channel for all categories' })
  async bulkUpdateChannel(
    @CurrentUser() user: { id: string },
    @Body() dto: BulkChannelPreferenceDto
  ) {
    const count = await this.preferenceService.bulkUpdateChannelPreference(
      user.id,
      dto.channel,
      dto.enabled
    );
    return { success: true, updatedCount: count };
  }

  @Patch('preferences/quiet-hours')
  @ApiOperation({ summary: 'Update quiet hours settings' })
  async updateQuietHours(
    @CurrentUser() user: { id: string },
    @Body() dto: QuietHoursDto
  ) {
    await this.preferenceService.updateQuietHours(user.id, dto);
    return { success: true };
  }

  // ============================================
  // QUOTA
  // ============================================

  @Get('quota')
  @ApiOperation({ summary: 'Get SMS/WhatsApp quota summary' })
  @ApiResponse({ status: 200, type: QuotaSummaryResponseDto })
  async getQuotaSummary(@CurrentUser() user: { id: string }) {
    const summary = await this.quotaService.getQuotaSummary(user.id);
    return summary;
  }

  @Get('quota/:channel')
  @ApiOperation({ summary: 'Get quota for specific channel' })
  @ApiParam({ name: 'channel', enum: ['sms', 'whatsapp'] })
  async getChannelQuota(
    @CurrentUser() user: { id: string },
    @Param('channel') channel: string
  ) {
    const notificationChannel =
      channel === 'sms'
        ? NotificationChannel.SMS
        : NotificationChannel.WHATSAPP;
    const quota = await this.quotaService.checkQuota(
      user.id,
      notificationChannel
    );
    return { channel, quota };
  }

  @Get('badges')
  @ApiOperation({
    summary: 'Get navbar badge counts based on user role',
    description: `Returns lightweight badge counts for navbar display.
  
**Called once on page load, then updated via SSE 'badge_update' events.**

**Role-based response:**
- **BUYER**: notifications, favorites, enquiriesWithResponses
- **AGENT**: notifications, newEnquiries, walletBalance, subscriptionDaysRemaining
- **ADMIN**: notifications, moderation counts (pending properties/ads, reports, KYC)

**Note:** Subscribe to SSE stream at \`/notifications/sse/stream\` to receive real-time badge updates.`
  })
  @ApiResponse({
    status: 200,
    description: 'Badge counts retrieved successfully',
    type: BadgeCountsResponseDto
  })
  async getBadgeCounts(
    @CurrentUser() user: { id: string; roles: string[] }
  ): Promise<BadgeCountsResponseDto> {
    return this.notificationService.getBadgeCounts(user.id, user.roles);
  }
}
