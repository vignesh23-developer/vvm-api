import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Admin } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { Notification, NotificationLog, MessagingTemplate } from '../entities';
import { TemplateService } from './template.service';
import { QuotaService } from './quota.service';
import { PreferenceService } from './preference.service';
import { PushService } from './push.service';
import { EventEmitterService } from './event-emitter.service';

import {
  NotificationChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationDeliveryStatus,
  NotificationEntityType,
  NotificationProvider
} from '../enums/notification.enum';
import { EmailService } from '../../shared';
import { SmsService } from '../../shared/services/sms/sms.service';
import { WhatsAppService } from '../../shared/services/whatsapp/whatsapp.service';
import {
  AdminBadgeCountsDto,
  AgentBadgeCountsDto,
  BadgeCountsResponseDto,
  BuyerBadgeCountsDto
} from '../dto/badge.dto';
import {
  ChannelSendResult,
  NotificationResult,
  SendNotificationDto
} from '../types/notification.type';
import { KycVerification } from '../../kyc/entities/kyc-verification.entity';
import { Enquiry } from '../../user-interactions/entities/enquiry.entity';
import { Property } from '../../property/entities/properties.entity';
import { Ad } from '../../ads/entities/ad.entity';
import { AdReport } from '../../ads/entities/ad-report.entity';
import { PropertyReport } from '../../property/entities/property-report.entity';
import { UserWallet } from '../../payment/entities/user-wallets.entity';
import { UserSubscription } from '../../subscription/entities/user-subscription.entity';
import { Favorite } from '../../user-interactions/entities/favorite.entity';


@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationLog)
    private readonly logRepo: Repository<NotificationLog>,
    @InjectRepository(Enquiry)
    private readonly enquiryRepo: Repository<Enquiry>,
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(KycVerification)
    private readonly kycRepo: Repository<KycVerification>,
    @InjectRepository(AdReport)
    private readonly adReportRepo: Repository<AdReport>,
    @InjectRepository(PropertyReport)
    private readonly propertyReportRepo: Repository<PropertyReport>,
    @InjectRepository(UserWallet)
    private readonly walletRepo: Repository<UserWallet>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepo: Repository<UserSubscription>,
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,


    private readonly templateService: TemplateService,
    private readonly quotaService: QuotaService,
    private readonly preferenceService: PreferenceService,
    private readonly pushService: PushService,
    private readonly eventEmitterService: EventEmitterService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly whatsAppService: WhatsAppService,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(NotificationService.name);
  }

  // ============================================
  // SEND NOTIFICATION (Main Entry Point)
  // ============================================

  async send(dto: SendNotificationDto): Promise<NotificationResult> {
    const {
      userId,
      templateCode,
      variables,
      entityType,
      entityId,
      priority,
      scheduledAt,
      overrideChannels
    } = dto;

    // 1. Get template
    const template = await this.templateService.getByCode(templateCode);
    if (!template) {
      this.logger.error({ templateCode }, 'Template not found');
      return this.createFailedResult('Template not found');
    }

    // 2. Determine channels to use
    const templateChannels = this.templateService.getEnabledChannels(template);
    const requestedChannels = overrideChannels || templateChannels;

    // 3. Filter by user preferences
    const allowedChannels = await this.preferenceService.getAllowedChannels(
      userId,
      template.category as NotificationCategory,
      requestedChannels
    );

    // 4. Prepare notification content
    const title = this.templateService.substituteVariables(
      template.in_app_title || template.push_title || template.name,
      variables
    );
    const body = this.templateService.substituteVariables(
      template.in_app_body || template.push_body || template.description || '',
      variables
    );

    // 5. Create notification record
    const notification = this.notificationRepo.create({
      user_id: userId,
      template_id: template.id,
      template_code: templateCode,
      title,
      body,
      category: template.category as NotificationCategory,
      priority:
        priority ||
        (template.in_app_priority as NotificationPriority) ||
        NotificationPriority.NORMAL,
      entity_type: entityType,
      entity_id: entityId,
      action_url: this.templateService.substituteVariables(
        template.in_app_action_url,
        variables
      ),
      data: variables,
      icon: template.in_app_icon,
      image_url: this.templateService.substituteVariables(
        template.push_image_url,
        variables
      ),
      scheduled_at: scheduledAt,
      channels_sent: [],
      channels_skipped: []
    });

    await this.notificationRepo.save(notification);

    // 6. If scheduled for later, return early
    if (scheduledAt && scheduledAt > new Date()) {
      this.logger.info(
        { notificationId: notification.id, scheduledAt },
        'Notification scheduled'
      );
      return {
        success: true,
        notificationId: notification.id,
        channelsSent: [],
        channelsSkipped: [],
        channelsFailed: [],
        errors: []
      };
    }

    // 7. Send through each channel
    const result = await this.dispatchToChannels(
      notification,
      template,
      variables,
      userId,
      allowedChannels,
      requestedChannels
    );

    // 8. Update notification record
    notification.channels_sent = result.channelsSent;
    notification.channels_skipped = [
      ...result.channelsSkipped,
      ...result.channelsFailed
    ];
    notification.is_sent = result.channelsSent.length > 0;
    notification.sent_at = new Date();
    await this.notificationRepo.save(notification);

    this.logger.info(
      {
        notificationId: notification.id,
        templateCode,
        userId,
        channelsSent: result.channelsSent,
        channelsSkipped: result.channelsSkipped
      },
      'Notification processed'
    );

    return { ...result, notificationId: notification.id };
  }

  // ============================================
  // DISPATCH TO CHANNELS
  // ============================================

  private async dispatchToChannels(
    notification: Notification,
    template: MessagingTemplate,
    variables: Record<string, any>,
    userId: string,
    allowedChannels: NotificationChannel[],
    requestedChannels: NotificationChannel[]
  ): Promise<Omit<NotificationResult, 'notificationId'>> {
    const channelsSent: NotificationChannel[] = [];
    const channelsSkipped: NotificationChannel[] = [];
    const channelsFailed: NotificationChannel[] = [];
    const errors: { channel: NotificationChannel; error: string }[] = [];

    // Track skipped due to preferences
    for (const channel of requestedChannels) {
      if (!allowedChannels.includes(channel)) {
        channelsSkipped.push(channel);
        await this.createLog(notification.id, channel, {
          success: false,
          error: 'User preference disabled',
          errorCode: 'PREFERENCE_DISABLED'
        });
      }
    }

    // Process each allowed channel
    for (const channel of allowedChannels) {
      const result = await this.sendToChannel(
        channel,
        notification,
        template,
        variables,
        userId
      );

      await this.createLog(notification.id, channel, result);

      if (result.success) {
        channelsSent.push(channel);
      } else if (
        result.errorCode === 'QUOTA_EXCEEDED' ||
        result.errorCode === 'NO_SUBSCRIPTION'
      ) {
        channelsSkipped.push(channel);
      } else {
        channelsFailed.push(channel);
        errors.push({ channel, error: result.error || 'Unknown error' });
      }
    }

    return {
      success: channelsSent.length > 0,
      channelsSent,
      channelsSkipped,
      channelsFailed,
      errors
    };
  }

  // ============================================
  // SEND TO INDIVIDUAL CHANNEL
  // ============================================

  private async sendToChannel(
    channel: NotificationChannel,
    notification: Notification,
    template: MessagingTemplate,
    variables: Record<string, any>,
    userId: string
  ): Promise<ChannelSendResult> {
    switch (channel) {
      case NotificationChannel.IN_APP:
        // In-app is already saved in notification table
        return { success: true, provider: NotificationProvider.INTERNAL };

      case NotificationChannel.SSE:
        return this.sendSSE(notification, template, variables, userId);

      case NotificationChannel.PUSH:
        return this.sendPush(notification, template, variables, userId);

      case NotificationChannel.EMAIL:
        return this.sendEmail(template, variables, userId);

      case NotificationChannel.SMS:
        return this.sendSms(template, variables, userId);

      case NotificationChannel.WHATSAPP:
        return this.sendWhatsApp(template, variables, userId);

      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  }

  // ============================================
  // SSE NOTIFICATION
  // ============================================

  private async sendSSE(
    notification: Notification,
    template: MessagingTemplate,
    variables: Record<string, any>,
    userId: string
  ): Promise<ChannelSendResult> {
    try {
      const payload = {
        id: notification.id,
        event: 'notification',
        data: {
          notificationId: notification.id,
          templateCode: template.code,
          title: notification.title,
          body: notification.body,
          category: notification.category,
          priority: notification.priority,
          entityType: notification.entity_type,
          entityId: notification.entity_id,
          actionUrl: notification.action_url,
          icon: notification.icon,
          imageUrl: notification.image_url,
          createdAt: notification.created_at,
          data: notification.data,
        },
      };

      const result = await this.eventEmitterService.sendToUser(userId, payload);

      if (result.connectionsSent > 0) {
        return {
          success: true,
          provider: NotificationProvider.INTERNAL,
          messageId: notification.id,
        };
      }

      return {
        success: false,
        provider: NotificationProvider.INTERNAL,
        error: 'No active SSE connections',
        errorCode: 'NO_CONNECTIONS',
      };
    } catch (error: any) {
      return {
        success: false,
        provider: NotificationProvider.INTERNAL,
        error: error.message,
      };
    }
  }

  // ============================================
  // PUSH NOTIFICATION
  // ============================================

  private async sendPush(
    notification: Notification,
    template: MessagingTemplate,
    variables: Record<string, any>,
    userId: string
  ): Promise<ChannelSendResult> {
    if (!template.push_enabled) {
      return {
        success: false,
        error: 'Push not enabled for template',
        errorCode: 'CHANNEL_DISABLED'
      };
    }

    const payload = {
      title: this.templateService.substituteVariables(
        template.push_title,
        variables
      ),
      body: this.templateService.substituteVariables(
        template.push_body,
        variables
      ),
      icon: template.push_icon,
      imageUrl: this.templateService.substituteVariables(
        template.push_image_url,
        variables
      ),
      clickAction: this.templateService.substituteVariables(
        template.push_click_action,
        variables
      ),
      sound: template.push_sound,
      data: {
        notificationId: notification.id,
        templateCode: template.code,
        ...Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, String(v)])
        )
      }
    };

    const result = await this.pushService.sendToUser(userId, payload);

    if (result.successCount > 0) {
      return {
        success: true,
        provider: NotificationProvider.FCM,
        messageId: result.results.find((r) => r.success)?.messageId,
        deviceSessionId: result.results.find((r) => r.success)?.deviceSessionId
      };
    }

    return {
      success: false,
      provider: NotificationProvider.FCM,
      error: result.results[0]?.error || 'No devices available',
      errorCode: result.results[0]?.errorCode
    };
  }

  // ============================================
  // EMAIL NOTIFICATION
  // ============================================

  private async sendEmail(
    template: MessagingTemplate,
    variables: Record<string, any>,
    userId: string
  ): Promise<ChannelSendResult> {
    if (!template.email_enabled) {
      return {
        success: false,
        error: 'Email not enabled for template',
        errorCode: 'CHANNEL_DISABLED'
      };
    }

    const email = variables.email || variables.user_email;
    if (!email) {
      return {
        success: false,
        error: 'No email address provided',
        errorCode: 'NO_RECIPIENT'
      };
    }

    try {
      const subject = this.templateService.substituteVariables(
        template.email_subject,
        variables
      );
      const html = this.templateService.substituteVariables(
        template.email_html_template,
        variables
      );
      const text = this.templateService.substituteVariables(
        template.email_text_template,
        variables
      );

      await this.emailService.send(email, subject, html, text);

      return {
        success: true,
        provider: NotificationProvider.GMAIL_SMTP,
        recipient: email
      };
    } catch (error: any) {
      return {
        success: false,
        provider: NotificationProvider.GMAIL_SMTP,
        error: error.message,
        recipient: email
      };
    }
  }

  // ============================================
  // SMS NOTIFICATION
  // ============================================

  private async sendSms(
    template: MessagingTemplate,
    variables: Record<string, any>,
    userId: string
  ): Promise<ChannelSendResult> {
    if (!template.sms_enabled) {
      return {
        success: false,
        error: 'SMS not enabled for template',
        errorCode: 'CHANNEL_DISABLED'
      };
    }

    // Check quota for templates that consume quota
    if (template.consumes_quota) {
      const quotaResult = await this.quotaService.checkQuota(
        userId,
        NotificationChannel.SMS
      );

      if (
        !quotaResult.hasActiveSubscription &&
        template.requires_paid_subscription
      ) {
        return {
          success: false,
          error: 'Paid subscription required',
          errorCode: 'NO_SUBSCRIPTION'
        };
      }

      if (!quotaResult.hasQuota && !quotaResult.isUnlimited) {
        return {
          success: false,
          error: 'SMS quota exceeded',
          errorCode: 'QUOTA_EXCEEDED'
        };
      }
    }

    const phone =
      variables.phone || variables.phoneNumber || variables.user_phone;
    if (!phone) {
      return {
        success: false,
        error: 'No phone number provided',
        errorCode: 'NO_RECIPIENT'
      };
    }

    try {
      // Build SMS variables in order
      const smsVariables = (template.sms_variables || []).map(
        (v: string) => variables[v] || ''
      );

      await this.smsService.send({
        phoneNumber: phone,
        templateId: template.sms_template_id,
        variables: smsVariables
      });

      // Increment quota if consumes_quota
      if (template.consumes_quota) {
        await this.quotaService.incrementUsage(userId, NotificationChannel.SMS);
      }

      return {
        success: true,
        provider: NotificationProvider.FAST2SMS,
        recipient: phone,
        quotaConsumed: template.consumes_quota
      };
    } catch (error: any) {
      return {
        success: false,
        provider: NotificationProvider.FAST2SMS,
        error: error.message,
        recipient: phone
      };
    }
  }

  // ============================================
  // WHATSAPP NOTIFICATION
  // ============================================

  private async sendWhatsApp(
    template: MessagingTemplate,
    variables: Record<string, any>,
    userId: string
  ): Promise<ChannelSendResult> {
    if (!template.whatsapp_enabled) {
      return {
        success: false,
        error: 'WhatsApp not enabled for template',
        errorCode: 'CHANNEL_DISABLED'
      };
    }

    // Check quota for templates that consume quota
    if (template.consumes_quota) {
      const quotaResult = await this.quotaService.checkQuota(
        userId,
        NotificationChannel.WHATSAPP
      );

      if (
        !quotaResult.hasActiveSubscription &&
        template.requires_paid_subscription
      ) {
        return {
          success: false,
          error: 'Paid subscription required',
          errorCode: 'NO_SUBSCRIPTION'
        };
      }

      if (!quotaResult.hasQuota && !quotaResult.isUnlimited) {
        return {
          success: false,
          error: 'WhatsApp quota exceeded',
          errorCode: 'QUOTA_EXCEEDED'
        };
      }
    }

    const phone =
      variables.phone || variables.phoneNumber || variables.user_phone;
    if (!phone) {
      return {
        success: false,
        error: 'No phone number provided',
        errorCode: 'NO_RECIPIENT'
      };
    }

    try {
      // Build WhatsApp template parameters
      const bodyParams = (template.whatsapp_body_variables || []).map(
        (v: string) => variables[v] || ''
      );

      await this.whatsAppService.send({
        phoneNumber: phone,
        templateName: template.whatsapp_template_name,
        languageCode: template.whatsapp_language_code || 'en',
        bodyParameters: bodyParams,
        headerType: template.whatsapp_header_type,
        headerVariables: template.whatsapp_header_variables?.map(
          (v: string) => variables[v]
        ),
        buttonType: template.whatsapp_button_type,
        buttonUrlVariable: template.whatsapp_button_url_variable
          ? variables[template.whatsapp_button_url_variable]
          : undefined
      });

      // Increment quota if consumes_quota
      if (template.consumes_quota) {
        await this.quotaService.incrementUsage(
          userId,
          NotificationChannel.WHATSAPP
        );
      }

      return {
        success: true,
        provider: NotificationProvider.INBUILTO,
        recipient: phone,
        quotaConsumed: template.consumes_quota
      };
    } catch (error: any) {
      return {
        success: false,
        provider: NotificationProvider.INBUILTO,
        error: error.message,
        recipient: phone
      };
    }
  }

  // ============================================
  // CREATE LOG ENTRY
  // ============================================

  private async createLog(
    notificationId: string,
    channel: NotificationChannel,
    result: ChannelSendResult
  ): Promise<NotificationLog> {
    const log = this.logRepo.create({
      notification_id: notificationId,
      channel,
      status: result.success
        ? NotificationDeliveryStatus.SENT
        : NotificationDeliveryStatus.FAILED,
      provider: result.provider,
      provider_message_id: result.messageId,
      recipient: result.recipient,
      device_session_id: result.deviceSessionId,
      error_message: result.error,
      error_code: result.errorCode,
      sent_at: result.success ? new Date() : null,
      failed_at: result.success ? null : new Date(),
      quota_consumed: result.quotaConsumed || false
    } as NotificationLog);

    return this.logRepo.save(log);
  }

  // ============================================
  // HELPER: CREATE FAILED RESULT
  // ============================================

  private createFailedResult(error: string): NotificationResult {
    return {
      success: false,
      notificationId: '',
      channelsSent: [],
      channelsSkipped: [],
      channelsFailed: [],
      errors: [{ channel: NotificationChannel.IN_APP, error }]
    };
  }

  // ============================================
  // GET USER NOTIFICATIONS (Paginated)
  // ============================================

  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      category?: NotificationCategory;
      unreadOnly?: boolean;
    } = {}
  ): Promise<{ data: Notification[]; total: number; unreadCount: number }> {
    const { page = 1, limit = 20, category, unreadOnly } = options;

    const query = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.is_deleted = false');

    if (category) {
      query.andWhere('n.category = :category', { category });
    }

    if (unreadOnly) {
      query.andWhere('n.is_read = false');
    }

    query.orderBy('n.created_at', 'DESC');

    // If limit is 0 or -1, return all records (no pagination)
    if (limit > 0) {
      query.skip((page - 1) * limit).take(limit);
    }

    const [data, total] = await query.getManyAndCount();

    // Get unread count
    const unreadCount = await this.notificationRepo.count({
      where: { user_id: userId, is_read: false, is_deleted: false }
    });

    return { data, total, unreadCount };
  }

  // ============================================
  // MARK AS READ
  // ============================================

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.notificationRepo.update(
      { id: notificationId, user_id: userId },
      { is_read: true, read_at: new Date() }
    );
    return (result.affected || 0) > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationRepo.update(
      { user_id: userId, is_read: false },
      { is_read: true, read_at: new Date() }
    );
    return result.affected || 0;
  }

  // ============================================
  // DELETE NOTIFICATION
  // ============================================

  async deleteNotification(
    notificationId: string,
    userId: string
  ): Promise<boolean> {
    const result = await this.notificationRepo.update(
      { id: notificationId, user_id: userId },
      { is_deleted: true, deleted_at: new Date() }
    );
    return (result.affected || 0) > 0;
  }

  async deleteAllNotifications(userId: string): Promise<number> {
    const result = await this.notificationRepo.update(
      { user_id: userId, is_deleted: false },
      { is_deleted: true, deleted_at: new Date() }
    );
    return result.affected || 0;
  }

  // ============================================
  // GET UNREAD COUNT
  // ============================================

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { user_id: userId, is_read: false, is_deleted: false }
    });
  }

  // ============================================
  // PROCESS SCHEDULED NOTIFICATIONS
  // ============================================

  async processScheduledNotifications(): Promise<number> {
    const now = new Date();

    const scheduled = await this.notificationRepo.find({
      where: {
        scheduled_at: LessThan(now),
        is_sent: false
      },
      take: 100
    });

    let processed = 0;

    for (const notification of scheduled) {
      // Re-send using existing data
      const template = await this.templateService.getByCode(
        notification.template_code
      );
      if (!template) continue;

      const allowedChannels = await this.preferenceService.getAllowedChannels(
        notification.user_id,
        notification.category,
        this.templateService.getEnabledChannels(template)
      );

      const result = await this.dispatchToChannels(
        notification,
        template,
        notification.data || {},
        notification.user_id,
        allowedChannels,
        this.templateService.getEnabledChannels(template)
      );

      notification.channels_sent = result.channelsSent;
      notification.channels_skipped = [
        ...result.channelsSkipped,
        ...result.channelsFailed
      ];
      notification.is_sent = result.channelsSent.length > 0;
      notification.sent_at = new Date();
      await this.notificationRepo.save(notification);

      processed++;
    }

    if (processed > 0) {
      this.logger.info({ processed }, 'Scheduled notifications processed');
    }

    return processed;
  }

  // In notification.service.ts

  async getBadgeCounts(
    userId: string,
    roles: string[]
  ): Promise<BadgeCountsResponseDto> {
    // Determine primary role (priority: ADMIN > AGENT > BUYER)
    const isAdmin = roles.includes('ADMIN');
    const isAgent = roles.includes('AGENT');

    // Common: unread notifications
    const notifications = await this.getUnreadCount(userId);

    if (isAdmin) {
      const adminBadges = await this.getAdminBadgeCounts(notifications);
      return {
        role: 'ADMIN',
        admin: adminBadges
      };
    }

    if (isAgent) {
      const agentBadges = await this.getAgentBadgeCounts(userId, notifications);
      return {
        role: 'AGENT',
        agent: agentBadges
      };
    }

    // Default: BUYER
    const buyerBadges = await this.getBuyerBadgeCounts(userId, notifications);
    return {
      role: 'BUYER',
      buyer: buyerBadges
    };
  }

  private async getBuyerBadgeCounts(
    userId: string,
    notifications: number
  ): Promise<BuyerBadgeCountsDto> {
    const [favorites, enquiriesWithResponses] = await Promise.all([
      // Total favorites (properties + ads)
      this.favoriteRepo.count({ where: { user_id: userId } }),

      // Enquiries that have been responded to (buyer wants to know if agent replied)
      this.enquiryRepo.count({
        where: {
          user_id: userId,
          status: 'responded'
        }
      })
    ]);

    return {
      role: 'BUYER',
      notifications,
      favorites,
      enquiriesWithResponses
    };
  }

  private async getAgentBadgeCounts(
    userId: string,
    notifications: number
  ): Promise<AgentBadgeCountsDto> {
    const [newEnquiries, wallet, subscription] = await Promise.all([
      // New enquiries for agent's properties/ads
      this.getAgentNewEnquiryCount(userId),

      // Wallet balance
      this.walletRepo.findOne({ where: { user_id: userId } }),

      // Subscription info
      this.getSubscriptionInfo(userId)
    ]);

    return {
      role: 'AGENT',
      notifications,
      newEnquiries,
      walletBalance: Number(wallet?.balance || 0),
      subscriptionDaysRemaining: subscription.daysRemaining,
      subscriptionExpiringSoon: subscription.isExpiringSoon
    };
  }

  private async getAgentNewEnquiryCount(userId: string): Promise<number> {
    // Count new/unread enquiries for properties and ads owned by this agent
    const count = await this.enquiryRepo
      .createQueryBuilder('e')
      .where('e.status = :status', { status: 'new' })
      .andWhere(`(
      (e.entity_type = 'property' AND e.entity_id IN (
        SELECT p.id FROM properties p WHERE p.owner_id = :userId OR p.agent_id = :userId
      ))
      OR
      (e.entity_type = 'ad' AND e.entity_id IN (
        SELECT a.id FROM ads a WHERE a.owner_id = :userId
      ))
    )`, { userId })
      .getCount();

    return count;
  }

  private async getSubscriptionInfo(userId: string): Promise<{
    daysRemaining?: number;
    isExpiringSoon: boolean;
  }> {
    const subscription = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.isActive = true')
      .orderBy('s.endDate', 'DESC')
      .getOne();

    if (!subscription) {
      return { isExpiringSoon: false };
    }

    const now = new Date();
    const endDate = new Date(subscription.endDate);
    const daysRemaining = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      daysRemaining: Math.max(0, daysRemaining),
      isExpiringSoon: daysRemaining <= 7 && daysRemaining > 0
    };
  }

// ============================================
// ADMIN BADGE COUNTS
// ============================================

  private async getAdminBadgeCounts(
    notifications: number
  ): Promise<AdminBadgeCountsDto> {
    const [
      pendingProperties,
      reportedProperties,
      pendingAds,
      reportedAds,
      kycRequests
    ] = await Promise.all([
      // Properties pending approval
      this.propertyRepo.count({
        where: { approval_status: 'UNDER_REVIEW' }
      }),

      // Reported properties pending review
      this.propertyReportRepo.count({
        where: { status: 'PENDING' }
      }),

      // Ads pending approval
      this.adRepo.count({
        where: { approval_status: 'UNDER_REVIEW' }
      }),

      // Reported ads pending review
      this.adReportRepo.count({
        where: { status: 'PENDING' }
      }),

      // KYC requests pending verification
      this.kycRepo.count({
        where: { status: 'PENDING' as any }
      })
    ]);

    const moderation = {
      pendingProperties,
      reportedProperties,
      pendingAds,
      reportedAds,
      kycRequests
    };

    const totalPendingActions =
      pendingProperties +
      reportedProperties +
      pendingAds +
      reportedAds +
      kycRequests;

    return {
      role: 'ADMIN',
      notifications,
      moderation,
      totalPendingActions
    };
  }

}
