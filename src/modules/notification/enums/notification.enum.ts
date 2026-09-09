export enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  SSE = 'sse',
}

export enum NotificationCategory {
  OTP = 'OTP',
  PROPERTY = 'PROPERTY',
  AD = 'AD',
  ENQUIRY = 'ENQUIRY',
  PAYMENT = 'PAYMENT',
  SUBSCRIPTION = 'SUBSCRIPTION',
  ACCOUNT = 'ACCOUNT',
  SYSTEM = 'SYSTEM',
  MARKETING = 'MARKETING',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum NotificationEntityType {
  PROPERTY = 'PROPERTY',
  AD = 'AD',
  ENQUIRY = 'ENQUIRY',
  PAYMENT = 'PAYMENT',
  SUBSCRIPTION = 'SUBSCRIPTION',
  USER = 'USER',
  AGENT = 'AGENT',
  KYC = 'KYC',
}

export enum NotificationDeliveryStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  CLICKED = 'CLICKED',
  SKIPPED = 'SKIPPED',
}

export enum NotificationProvider {
  FAST2SMS = 'FAST2SMS',
  TWILIO = 'TWILIO',

  INBUILTO = 'INBUILTO',
  WATI = 'WATI',

  GMAIL_SMTP = 'GMAIL_SMTP',
  SENDGRID = 'SENDGRID',

  FCM = 'FCM',

  INTERNAL = 'INTERNAL',
}

export enum WhatsAppHeaderType {
  NONE = 'none',
  TEXT = 'text',
  IMAGE = 'image',
  DOCUMENT = 'document',
  VIDEO = 'video',
}

export enum WhatsAppButtonType {
  NONE = 'none',
  URL = 'url',
  QUICK_REPLY = 'quick_reply',
  CALL = 'call',
}

export enum SubscriptionItemId {
  SMS_QUOTA = 10,
  WHATSAPP_QUOTA = 11,
}