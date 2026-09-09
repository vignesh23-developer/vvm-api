import {
  NotificationChannel,
  NotificationEntityType,
  NotificationPriority,
  NotificationProvider
} from '../enums/notification.enum';

export interface SendNotificationDto {
  userId: string;
  templateCode: string;
  variables: Record<string, any>;
  entityType?: NotificationEntityType;
  entityId?: string;
  priority?: NotificationPriority;
  scheduledAt?: Date;
  overrideChannels?: NotificationChannel[];
}

export interface NotificationResult {
  success: boolean;
  notificationId: string;
  channelsSent: NotificationChannel[];
  channelsSkipped: NotificationChannel[];
  channelsFailed: NotificationChannel[];
  errors: { channel: NotificationChannel; error: string }[];
}

export interface ChannelSendResult {
  success: boolean;
  provider?: NotificationProvider;
  messageId?: string;
  error?: string;
  errorCode?: string;
  recipient?: string;
  deviceSessionId?: string;
  quotaConsumed?: boolean;
}
