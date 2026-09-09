import { Injectable } from '@nestjs/common';
import {
  NotificationService,
} from '../services/notification.service';
import {
  NotificationEntityType,
  NotificationPriority
} from '../enums/notification.enum';
import { PinoLogger } from 'nestjs-pino';
import { SendNotificationDto } from '../types/notification.type';

@Injectable()
export class NotificationHelper {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(NotificationHelper.name);
  }

  async propertyCreatedAgent(
    userId: string,
    variables: {
      property_title: string;
      property_id: string;
      property_url: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'PROPERTY_CREATED_AGENT',
      variables,
      entityType: NotificationEntityType.PROPERTY,
      entityId: variables.property_id
    });
  }

  async propertyCreatedAdmin(
    adminUserIds: string[],
    variables: {
      property_title: string;
      property_id: string;
      agent_name: string;
      agent_id: string;
    }
  ) {
    const results: any[] = [];
    for (const userId of adminUserIds) {
      const result: any = await this.send({
        userId,
        templateCode: 'PROPERTY_CREATED_ADMIN',
        variables,
        entityType: NotificationEntityType.PROPERTY,
        entityId: variables.property_id,
        priority: NotificationPriority.HIGH
      });
      results.push(result);
    }
    return results;
  }

  async propertyApproved(
    userId: string,
    variables: {
      property_title: string;
      property_id: string;
      property_url: string;
      short_url?: string;
      email?: string;
      phone?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'PROPERTY_APPROVED',
      variables,
      entityType: NotificationEntityType.PROPERTY,
      entityId: variables.property_id,
      priority: NotificationPriority.HIGH
    });
  }

  async propertyRejected(
    userId: string,
    variables: {
      property_title: string;
      property_id: string;
      rejection_reason: string;
      email?: string;
      phone?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'PROPERTY_REJECTED',
      variables,
      entityType: NotificationEntityType.PROPERTY,
      entityId: variables.property_id,
      priority: NotificationPriority.HIGH
    });
  }

  async propertyExpiring(
    userId: string,
    variables: {
      property_title: string;
      property_id: string;
      days_remaining: number;
      expiry_date: string;
      email?: string;
      phone?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'PROPERTY_EXPIRING',
      variables,
      entityType: NotificationEntityType.PROPERTY,
      entityId: variables.property_id
    });
  }

  async propertyExpired(
    userId: string,
    variables: {
      property_title: string;
      property_id: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'PROPERTY_EXPIRED',
      variables,
      entityType: NotificationEntityType.PROPERTY,
      entityId: variables.property_id
    });
  }

  async enquiryReceived(
    agentUserId: string,
    variables: {
      buyer_name: string;
      buyer_phone: string;
      buyer_email: string;
      property_title: string;
      property_id: string;
      message: string;
      enquiry_id: string;
      enquiry_url: string;
      email?: string;
      phone?: string;
    }
  ) {
    return this.send({
      userId: agentUserId,
      templateCode: 'ENQUIRY_RECEIVED',
      variables,
      entityType: NotificationEntityType.ENQUIRY,
      entityId: variables.enquiry_id,
      priority: NotificationPriority.HIGH
    });
  }

  async enquiryResponse(
    buyerUserId: string,
    variables: {
      agent_name: string;
      property_title: string;
      property_id: string;
      response_message: string;
      enquiry_id: string;
      email?: string;
    }
  ) {
    return this.send({
      userId: buyerUserId,
      templateCode: 'ENQUIRY_RESPONSE',
      variables,
      entityType: NotificationEntityType.ENQUIRY,
      entityId: variables.enquiry_id
    });
  }

  async leadFollowupReminder(
    agentUserId: string,
    variables: {
      buyer_name: string;
      buyer_phone: string;
      property_title: string;
      enquiry_id: string;
      notes?: string;
    }
  ) {
    return this.send({
      userId: agentUserId,
      templateCode: 'LEAD_FOLLOWUP_REMINDER',
      variables,
      entityType: NotificationEntityType.ENQUIRY,
      entityId: variables.enquiry_id
    });
  }

  async paymentSuccess(
    userId: string,
    variables: {
      amount: number | string;
      item_name: string;
      transaction_id: string;
      payment_id: string;
      invoice_url: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'PAYMENT_SUCCESS',
      variables,
      entityType: NotificationEntityType.PAYMENT,
      entityId: variables.payment_id
    });
  }

  async paymentFailed(
    userId: string,
    variables: {
      amount: number | string;
      item_name: string;
      error_message: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'PAYMENT_FAILED',
      variables,
      priority: NotificationPriority.HIGH
    });
  }

  async subscriptionActivated(
    userId: string,
    variables: {
      plan_name: string;
      expiry_date: string;
      subscription_id: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'SUBSCRIPTION_ACTIVATED',
      variables,
      entityType: NotificationEntityType.SUBSCRIPTION,
      entityId: variables.subscription_id,
      priority: NotificationPriority.HIGH
    });
  }

  async subscriptionExpiring(
    userId: string,
    variables: {
      plan_name: string;
      days_remaining: number;
      expiry_date: string;
      renew_url: string;
      email?: string;
      phone?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'SUBSCRIPTION_EXPIRING',
      variables,
      entityType: NotificationEntityType.SUBSCRIPTION
    });
  }

  async subscriptionExpired(
    userId: string,
    variables: {
      plan_name: string;
      expired_date: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'SUBSCRIPTION_EXPIRED',
      variables,
      entityType: NotificationEntityType.SUBSCRIPTION
    });
  }

  async quotaWarning(
    userId: string,
    variables: {
      channel: string;
      used: number;
      limit: number;
      remaining: number;
      percent_used: number;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'QUOTA_WARNING',
      variables
    });
  }

  async quotaExceeded(
    userId: string,
    variables: {
      channel: string;
      limit: number;
      reset_date: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'QUOTA_EXCEEDED',
      variables,
      priority: NotificationPriority.URGENT
    });
  }

  async welcome(
    userId: string,
    variables: {
      user_name: string;
      user_email: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'WELCOME',
      variables,
      entityType: NotificationEntityType.USER,
      entityId: userId
    });
  }

  async kycApproved(userId: string, variables: { email?: string } = {}) {
    return this.send({
      userId,
      templateCode: 'KYC_APPROVED',
      variables,
      entityType: NotificationEntityType.USER,
      entityId: userId,
      priority: NotificationPriority.HIGH
    });
  }

  async kycRejected(
    userId: string,
    variables: {
      rejection_reason: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'KYC_REJECTED',
      variables,
      entityType: NotificationEntityType.USER,
      entityId: userId,
      priority: NotificationPriority.HIGH
    });
  }

  async agentApproved(
    userId: string,
    variables: {
      agent_name: string;
      email?: string;
    }
  ) {
    return this.send({
      userId,
      templateCode: 'AGENT_APPROVED',
      variables,
      entityType: NotificationEntityType.AGENT,
      entityId: userId,
      priority: NotificationPriority.HIGH
    });
  }

  async systemMaintenance(
    userIds: string[],
    variables: {
      maintenance_date: string;
      start_time: string;
      end_time: string;
    }
  ) {
    const results: any[] = [];
    for (const userId of userIds) {
      const result = await this.send({
        userId,
        templateCode: 'SYSTEM_MAINTENANCE',
        variables
      });
      results.push(result);
    }
    return results;
  }

  private async send(dto: SendNotificationDto) {
    try {
      return await this.notificationService.send(dto);
    } catch (error) {
      this.logger.error({ error, dto }, 'Failed to send notification');
      return {
        success: false,
        notificationId: '',
        channelsSent: [],
        channelsSkipped: [],
        channelsFailed: [],
        errors: [{ channel: 'all' as any, error: error.message }]
      };
    }
  }
}
