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
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TemplateService } from '../services/template.service';
import {
  NotificationService

} from '../services/notification.service';
import { QuotaService } from '../services/quota.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateFilterDto,
  SendNotificationDto
} from '../dto';
import {
  NotificationChannel,
  NotificationEntityType,
  NotificationPriority
} from '../enums/notification.enum';
import {SendNotificationDto as SendNotificationInput} from '../types/notification.type';

@ApiTags('Admin - Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/notifications')
export class AdminNotificationController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly notificationService: NotificationService,
    private readonly quotaService: QuotaService
  ) {}

  // ============================================
  // TEMPLATE MANAGEMENT
  // ============================================

  @Get('templates')
  @ApiOperation({ summary: 'Get all messaging templates' })
  async getTemplates(@Query() filter: TemplateFilterDto) {
    const result = await this.templateService.findAll(filter);
    return {
      ...result,
      page: filter.page || 1,
      limit: filter.limit || 50
    };
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template by ID' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    const template = await this.templateService.findById(id);
    return { template };
  }

  @Get('templates/code/:code')
  @ApiOperation({ summary: 'Get template by code' })
  @ApiParam({ name: 'code', description: 'Template code' })
  async getTemplateByCode(@Param('code') code: string) {
    const template = await this.templateService.getByCode(code);
    return { template };
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create new template' })
  async createTemplate(@Body() dto: CreateTemplateDto) {
    const template = await this.templateService.create(dto);
    return { template, message: 'Template created successfully' };
  }

  @Patch('templates/:id')
  @ApiOperation({ summary: 'Update template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto
  ) {
    const template = await this.templateService.update(id, dto);
    return { template, message: 'Template updated successfully' };
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Deactivate template (soft delete)' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  @HttpCode(HttpStatus.OK)
  async deleteTemplate(@Param('id', ParseUUIDPipe) id: string) {
    await this.templateService.delete(id);
    return { success: true, message: 'Template deactivated' };
  }

  @Delete('templates/:id/permanent')
  @ApiOperation({ summary: 'Permanently delete template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  @HttpCode(HttpStatus.OK)
  async hardDeleteTemplate(@Param('id', ParseUUIDPipe) id: string) {
    await this.templateService.hardDelete(id);
    return { success: true, message: 'Template permanently deleted' };
  }

  @Post('templates/bulk-status')
  @ApiOperation({ summary: 'Bulk update template status' })
  async bulkUpdateStatus(@Body() body: { ids: string[]; is_active: boolean }) {
    const count = await this.templateService.bulkUpdateStatus(
      body.ids,
      body.is_active
    );
    return { success: true, updatedCount: count };
  }

  @Post('templates/preload-cache')
  @ApiOperation({ summary: 'Preload all templates to cache' })
  async preloadCache() {
    const count = await this.templateService.preloadToCache();
    return { success: true, cachedCount: count };
  }

  @Post('templates/clear-cache')
  @ApiOperation({ summary: 'Clear template cache' })
  async clearCache(@Body() body: { code?: string }) {
    await this.templateService.clearTemplateCache(body.code);
    return {
      success: true,
      message: body.code
        ? `Cache cleared for ${body.code}`
        : 'All template cache cleared'
    };
  }

  // ============================================
  // SEND NOTIFICATION (Admin)
  // ============================================

  @Post('send')
  @ApiOperation({ summary: 'Send notification to user' })
  async sendNotification(@Body() dto: SendNotificationDto) {
    const input: SendNotificationInput = {
      userId: dto.userId,
      templateCode: dto.templateCode,
      variables: dto.variables,
      entityType: dto.entityType as NotificationEntityType,
      entityId: dto.entityId,
      priority: dto.priority as NotificationPriority,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      overrideChannels: dto.overrideChannels as NotificationChannel[]
    };

    const result = await this.notificationService.send(input);
    return result;
  }

  @Post('send-bulk')
  @ApiOperation({ summary: 'Send notification to multiple users' })
  async sendBulkNotification(
    @Body()
    body: {
      userIds: string[];
      templateCode: string;
      variables: Record<string, any>;
      entityType?: string;
      entityId?: string;
    }
  ) {
    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const userId of body.userIds) {
      const result = await this.notificationService.send({
        userId,
        templateCode: body.templateCode,
        variables: body.variables,
        entityType: body.entityType as NotificationEntityType,
        entityId: body.entityId
      });

      results.push({ userId, ...result });

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return {
      totalSent: body.userIds.length,
      successCount,
      failureCount,
      results
    };
  }

  // ============================================
  // QUOTA MANAGEMENT (Admin)
  // ============================================

  @Get('quota/user/:userId')
  @ApiOperation({ summary: 'Get quota summary for specific user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async getUserQuota(@Param('userId', ParseUUIDPipe) userId: string) {
    const summary = await this.quotaService.getQuotaSummary(userId);
    return { userId, ...summary };
  }

  @Get('quota/near-limit')
  @ApiOperation({ summary: 'Get users near quota limit' })
  async getUsersNearLimit(
    @Query('channel') channel: 'sms' | 'whatsapp' = 'sms',
    @Query('threshold') threshold: number = 80
  ) {
    const notificationChannel =
      channel === 'sms'
        ? NotificationChannel.SMS
        : NotificationChannel.WHATSAPP;
    const users = await this.quotaService.getUsersNearQuotaLimit(
      notificationChannel,
      threshold
    );
    return { channel, threshold, users };
  }

  // ============================================
  // SCHEDULED NOTIFICATIONS
  // ============================================

  @Post('process-scheduled')
  @ApiOperation({ summary: 'Process scheduled notifications' })
  async processScheduled() {
    const count =
      await this.notificationService.processScheduledNotifications();
    return { success: true, processedCount: count };
  }

  // ============================================
  // PREVIEW TEMPLATE
  // ============================================

  @Post('templates/preview')
  @ApiOperation({ summary: 'Preview template with variables' })
  async previewTemplate(
    @Body() body: { code: string; variables: Record<string, any> }
  ) {
    const template = await this.templateService.getByCode(body.code);
    if (!template) {
      return { error: 'Template not found' };
    }

    const preview = {
      code: template.code,
      name: template.name,
      category: template.category,
      channels: this.templateService.getEnabledChannels(template),
      in_app: template.in_app_enabled
        ? {
            title: this.templateService.substituteVariables(
              template.in_app_title,
              body.variables
            ),
            body: this.templateService.substituteVariables(
              template.in_app_body,
              body.variables
            ),
            action_url: this.templateService.substituteVariables(
              template.in_app_action_url,
              body.variables
            )
          }
        : null,
      push: template.push_enabled
        ? {
            title: this.templateService.substituteVariables(
              template.push_title,
              body.variables
            ),
            body: this.templateService.substituteVariables(
              template.push_body,
              body.variables
            ),
            image_url: this.templateService.substituteVariables(
              template.push_image_url,
              body.variables
            ),
            click_action: this.templateService.substituteVariables(
              template.push_click_action,
              body.variables
            )
          }
        : null,
      email: template.email_enabled
        ? {
            subject: this.templateService.substituteVariables(
              template.email_subject,
              body.variables
            ),
            html: this.templateService.substituteVariables(
              template.email_html_template,
              body.variables
            )
          }
        : null,
      sms: template.sms_enabled
        ? {
            template_id: template.sms_template_id,
            preview: this.templateService.substituteVariables(
              template.sms_preview,
              body.variables
            )
          }
        : null,
      whatsapp: template.whatsapp_enabled
        ? {
            template_name: template.whatsapp_template_name,
            preview: this.templateService.substituteVariables(
              template.whatsapp_preview,
              body.variables
            )
          }
        : null
    };

    return { preview };
  }
}
