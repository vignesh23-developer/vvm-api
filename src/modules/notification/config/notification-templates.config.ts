import { NotificationCategory, NotificationChannel } from '../enums/notification.enum';

/**
 * Notification Template Configuration
 *
 * Hardcoded templates for all notification types.
 * Variables use {{variable_name}} syntax.
 *
 * Later: These can be moved to database for admin management.
 */

export interface NotificationTemplateConfig {
  code: string;
  name: string;
  category: NotificationCategory;

  title: string;
  body: string;
  icon?: string;

  emailSubject?: string;
  emailTemplate?: string;

  smsTemplate?: string;

  whatsappTemplateId?: string;
  whatsappTemplate?: string;

  channels: NotificationChannel[];

  variables: string[];

  actionUrl?: string;

  requiresPaid: boolean;

  targetRoles?: string[];
}

export const PROPERTY_TEMPLATES: Record<string, NotificationTemplateConfig> = {
  // Agent creates property
  PROPERTY_CREATED_AGENT: {
    code: 'PROPERTY_CREATED_AGENT',
    name: 'Property Submitted (Agent)',
    category: NotificationCategory.PROPERTY,
    title: 'Property Submitted for Review',
    body: 'Thank you for listing your property "{{property_title}}" with Vaazhga Valamudan Digital Realty Solutions.\n\nYour property is currently under review for approval. Our verification team is checking the details to ensure quality and authenticity.\n\nOnce approved, your listing will go live and become visible to genuine buyers across Tamil Nadu.\n\nThank you for your patience — we\'ll notify you as soon as the approval process is completed.',
    icon: 'property-pending',
    emailSubject: 'Property Submitted - {{property_title}}',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['property_title', 'property_id'],
    actionUrl: '/my-properties/{{property_id}}',
    requiresPaid: false,
  },

  // Admin receives new property for approval
  PROPERTY_CREATED_ADMIN: {
    code: 'PROPERTY_CREATED_ADMIN',
    name: 'New Property Pending (Admin)',
    category: NotificationCategory.PROPERTY,
    title: 'New Property Pending Approval',
    body: 'New property "{{property_title}}" by {{agent_name}} needs approval.',
    icon: 'property-review',
    emailSubject: '[Action Required] New Property: {{property_title}}',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['property_title', 'property_id', 'agent_name', 'agent_id'],
    actionUrl: '/admin/properties/{{property_id}}/review',
    requiresPaid: false,
    targetRoles: ['ADMIN'],
  },

  // Property approved
  PROPERTY_APPROVED: {
    code: 'PROPERTY_APPROVED',
    name: 'Property Approved',
    category: NotificationCategory.PROPERTY,
    title: 'Property Approved!',
    body: 'Congratulations! Your property "{{property_title}}" listing has been successfully approved by Vaazhga Valamudan Digital Realty Solutions.\n\nYour listing is now live and visible to genuine buyers across Tamil Nadu.\n\nYou can start receiving enquiries and connecting with interested prospects right away.\n\nThank you for choosing our platform — wishing you great success with your listing!',
    icon: 'property-approved',
    emailSubject: 'Property Approved - {{property_title}}',
    smsTemplate: 'VVM: Your property "{{property_title}}" is now live! View at {{short_url}}',
    whatsappTemplate: '*Property Approved!*\n\nYour property "{{property_title}}" is now live.\n\n🔗 View: {{property_url}}',
    channels: [
      NotificationChannel.IN_APP,
      NotificationChannel.SSE,
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
      NotificationChannel.SMS,
      NotificationChannel.WHATSAPP,
    ],
    variables: ['property_title', 'property_id', 'property_url', 'short_url'],
    actionUrl: '/properties/{{property_id}}',
    requiresPaid: false, // SMS/WhatsApp only sent if paid
  },

  // Property rejected
  PROPERTY_REJECTED: {
    code: 'PROPERTY_REJECTED',
    name: 'Property Rejected',
    category: NotificationCategory.PROPERTY,
    title: 'Property Needs Changes',
    body: 'Thank you for submitting your property "{{property_title}}" listing to Vaazhga Valamudan Digital Realty Solutions.\n\nDuring verification, we noticed that some required details are missing or incomplete, so the listing could not be approved at this time. {{rejection_reason}}\n\nPlease edit the listing, update the missing information, and resubmit it for review.\n\nOnce updated, our team will re-verify and approve the listing at the earliest.\n\nThank you for your cooperation — we\'re here to help you get your property live quickly.',
    icon: 'property-rejected',
    emailSubject: 'Action Required - {{property_title}}',
    smsTemplate: 'VVM: Property "{{property_title}}" needs changes. Check app for details.',
    channels: [
      NotificationChannel.IN_APP,
      NotificationChannel.SSE,
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
      NotificationChannel.SMS,
    ],
    variables: ['property_title', 'property_id', 'rejection_reason'],
    actionUrl: '/my-properties/{{property_id}}/edit',
    requiresPaid: false,
  },

  // Property expiring soon
  PROPERTY_EXPIRING: {
    code: 'PROPERTY_EXPIRING',
    name: 'Property Expiring Soon',
    category: NotificationCategory.PROPERTY,
    title: 'Listing Expiring Soon',
    body: 'Your property "{{property_title}}" will expire in {{days_remaining}} days. Renew to keep it visible.',
    icon: 'property-expiring',
    emailSubject: 'Listing Expiring - {{property_title}}',
    smsTemplate: 'VVM: "{{property_title}}" expires in {{days_remaining}} days. Renew now!',
    channels: [
      NotificationChannel.IN_APP,
      NotificationChannel.SSE,
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
      NotificationChannel.SMS,
    ],
    variables: ['property_title', 'property_id', 'days_remaining', 'expiry_date'],
    actionUrl: '/my-properties/{{property_id}}/renew',
    requiresPaid: false,
  },

  // Property expired
  PROPERTY_EXPIRED: {
    code: 'PROPERTY_EXPIRED',
    name: 'Property Expired',
    category: NotificationCategory.PROPERTY,
    title: 'Listing Expired',
    body: 'Your property "{{property_title}}" has expired and is no longer visible. Renew to reactivate.',
    icon: 'property-expired',
    emailSubject: 'Listing Expired - {{property_title}}',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['property_title', 'property_id'],
    actionUrl: '/my-properties/{{property_id}}/renew',
    requiresPaid: false,
  },

  // New matching property for saved search
  PROPERTY_MATCH_SAVED_SEARCH: {
    code: 'PROPERTY_MATCH_SAVED_SEARCH',
    name: 'New Matching Property',
    category: NotificationCategory.PROPERTY,
    title: 'New Property Matches Your Search!',
    body: 'A new property "{{property_title}}" in {{location}} matches your saved search "{{search_name}}".',
    icon: 'property-match',
    emailSubject: 'New Property Alert - {{search_name}}',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['property_title', 'property_id', 'location', 'price', 'search_name', 'search_id'],
    actionUrl: '/properties/{{property_id}}',
    requiresPaid: false,
  },

  // Price drop on favorited property
  PROPERTY_PRICE_DROP: {
    code: 'PROPERTY_PRICE_DROP',
    name: 'Price Drop Alert',
    category: NotificationCategory.PROPERTY,
    title: 'Price Dropped!',
    body: 'Good news! "{{property_title}}" you saved has dropped from ₹{{old_price}} to ₹{{new_price}}.',
    icon: 'price-drop',
    emailSubject: 'Price Drop - {{property_title}}',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['property_title', 'property_id', 'old_price', 'new_price', 'discount_percent'],
    actionUrl: '/properties/{{property_id}}',
    requiresPaid: false,
  },
};

export const ENQUIRY_TEMPLATES: Record<string, NotificationTemplateConfig> = {
  // New enquiry received by agent
  ENQUIRY_RECEIVED: {
    code: 'ENQUIRY_RECEIVED',
    name: 'New Enquiry Received',
    category: NotificationCategory.ENQUIRY,
    title: 'New Enquiry!',
    body: 'You\'ve received a new enquiry for your property "{{property_title}}" listed on Vaazhga Valamudan Digital Realty Solutions.\n\n{{buyer_name}} has shown interest and submitted their details through the enquiry form. Contact: {{buyer_phone}}\n\n{{message}}\n\nPlease review the enquiry and respond at the earliest to maximize engagement and conversion.\n\nWishing you a successful connection!',
    icon: 'enquiry-new',
    emailSubject: 'New Enquiry - {{property_title}}',
    smsTemplate: 'VVM: New enquiry from {{buyer_name}} for "{{property_title}}". Call {{buyer_phone}}',
    whatsappTemplate: '*New Enquiry!*\n\n*Property:* {{property_title}}\n*From:* {{buyer_name}}\n*Phone:* {{buyer_phone}}\n*Message:* {{message}}\n\n🔗 View: {{enquiry_url}}',
    channels: [
      NotificationChannel.IN_APP,
      NotificationChannel.SSE,
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
      NotificationChannel.SMS,
      NotificationChannel.WHATSAPP,
    ],
    variables: ['buyer_name', 'buyer_phone', 'buyer_email', 'property_title', 'property_id', 'message', 'enquiry_id', 'enquiry_url'],
    actionUrl: '/leads/{{enquiry_id}}',
    requiresPaid: false,
  },

  // Agent responded to buyer
  ENQUIRY_RESPONSE: {
    code: 'ENQUIRY_RESPONSE',
    name: 'Agent Responded',
    category: NotificationCategory.ENQUIRY,
    title: 'Agent Responded',
    body: '{{agent_name}} responded to your enquiry for "{{property_title}}".',
    icon: 'enquiry-response',
    emailSubject: 'Response to Your Enquiry - {{property_title}}',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['agent_name', 'property_title', 'property_id', 'response_message', 'enquiry_id'],
    actionUrl: '/enquiries/{{enquiry_id}}',
    requiresPaid: false,
  },

  // Lead status changed
  LEAD_STATUS_CHANGED: {
    code: 'LEAD_STATUS_CHANGED',
    name: 'Lead Status Updated',
    category: NotificationCategory.ENQUIRY,
    title: 'Lead Status: {{new_status}}',
    body: 'Lead for "{{property_title}}" from {{buyer_name}} marked as {{new_status}}.',
    icon: 'lead-status',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE],
    variables: ['buyer_name', 'property_title', 'enquiry_id', 'old_status', 'new_status'],
    actionUrl: '/leads/{{enquiry_id}}',
    requiresPaid: false,
  },

  // Follow-up reminder
  LEAD_FOLLOWUP_REMINDER: {
    code: 'LEAD_FOLLOWUP_REMINDER',
    name: 'Follow-up Reminder',
    category: NotificationCategory.ENQUIRY,
    title: 'Follow-up Reminder',
    body: 'Time to follow up with {{buyer_name}} for "{{property_title}}".',
    icon: 'followup-reminder',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH],
    variables: ['buyer_name', 'buyer_phone', 'property_title', 'enquiry_id', 'notes'],
    actionUrl: '/leads/{{enquiry_id}}',
    requiresPaid: false,
  },
};

export const PAYMENT_TEMPLATES: Record<string, NotificationTemplateConfig> = {
  // Payment successful
  PAYMENT_SUCCESS: {
    code: 'PAYMENT_SUCCESS',
    name: 'Payment Successful',
    category: NotificationCategory.PAYMENT,
    title: 'Payment Successful',
    body: 'Payment of ₹{{amount}} for {{item_name}} was successful. Transaction ID: {{transaction_id}}',
    icon: 'payment-success',
    emailSubject: 'Payment Confirmation - ₹{{amount}}',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['amount', 'item_name', 'transaction_id', 'payment_id', 'invoice_url'],
    actionUrl: '/payments/{{payment_id}}',
    requiresPaid: false,
  },

  // Payment failed
  PAYMENT_FAILED: {
    code: 'PAYMENT_FAILED',
    name: 'Payment Failed',
    category: NotificationCategory.PAYMENT,
    title: 'Payment Failed',
    body: 'Payment of ₹{{amount}} for {{item_name}} failed. Please try again.',
    icon: 'payment-failed',
    emailSubject: 'Payment Failed - Please Retry',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['amount', 'item_name', 'error_message'],
    actionUrl: '/checkout/retry',
    requiresPaid: false,
  },

  // Subscription activated
  SUBSCRIPTION_ACTIVATED: {
    code: 'SUBSCRIPTION_ACTIVATED',
    name: 'Subscription Activated',
    category: NotificationCategory.SUBSCRIPTION,
    title: 'Welcome to {{plan_name}}! 🎉',
    body: 'Your {{plan_name}} subscription is now active until {{expiry_date}}. Enjoy premium features!',
    icon: 'subscription-active',
    emailSubject: 'Welcome to {{plan_name}} - Subscription Active',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['plan_name', 'expiry_date', 'subscription_id'],
    actionUrl: '/subscription',
    requiresPaid: false,
  },

  // Subscription expiring
  SUBSCRIPTION_EXPIRING: {
    code: 'SUBSCRIPTION_EXPIRING',
    name: 'Subscription Expiring',
    category: NotificationCategory.SUBSCRIPTION,
    title: 'Subscription Expiring Soon',
    body: 'Your {{plan_name}} expires in {{days_remaining}} days. Renew now to continue premium features.',
    icon: 'subscription-expiring',
    emailSubject: 'Subscription Expiring - Renew Now',
    smsTemplate: 'VVM: Your {{plan_name}} expires in {{days_remaining}} days. Renew at {{renew_url}}',
    whatsappTemplate: '*Subscription Expiring*\n\nYour {{plan_name}} expires in {{days_remaining}} days.\n\n🔗 Renew: {{renew_url}}',
    channels: [
      NotificationChannel.IN_APP,
      NotificationChannel.SSE,
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
      NotificationChannel.SMS,
      NotificationChannel.WHATSAPP,
    ],
    variables: ['plan_name', 'days_remaining', 'expiry_date', 'renew_url'],
    actionUrl: '/subscription/renew',
    requiresPaid: false, // Important to send even if expiring
  },

  // Subscription expired
  SUBSCRIPTION_EXPIRED: {
    code: 'SUBSCRIPTION_EXPIRED',
    name: 'Subscription Expired',
    category: NotificationCategory.SUBSCRIPTION,
    title: 'Subscription Expired',
    body: 'Your {{plan_name}} has expired. Renew now to restore premium features.',
    icon: 'subscription-expired',
    emailSubject: 'Subscription Expired - Renew to Continue',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['plan_name', 'expired_date'],
    actionUrl: '/subscription/renew',
    requiresPaid: false,
  },

  // Wallet credited
  WALLET_CREDITED: {
    code: 'WALLET_CREDITED',
    name: 'Wallet Credited',
    category: NotificationCategory.PAYMENT,
    title: 'Wallet Credited',
    body: '₹{{amount}} has been added to your wallet. New balance: ₹{{new_balance}}',
    icon: 'wallet-credit',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH],
    variables: ['amount', 'new_balance', 'source', 'transaction_id'],
    actionUrl: '/wallet',
    requiresPaid: false,
  },

  // Wallet low balance
  WALLET_LOW_BALANCE: {
    code: 'WALLET_LOW_BALANCE',
    name: 'Low Wallet Balance',
    category: NotificationCategory.PAYMENT,
    title: 'Low Wallet Balance',
    body: 'Your wallet balance is low: ₹{{balance}}. Add funds to continue using services.',
    icon: 'wallet-low',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH],
    variables: ['balance'],
    actionUrl: '/wallet/add-funds',
    requiresPaid: false,
  },
};

export const ACCOUNT_TEMPLATES: Record<string, NotificationTemplateConfig> = {
  // Welcome new user
  WELCOME: {
    code: 'WELCOME',
    name: 'Welcome New User',
    category: NotificationCategory.ACCOUNT,
    title: 'Welcome to VaazhgaValamudan! 🏠',
    body: 'Thank you for joining us. Start exploring properties or list your own!',
    icon: 'welcome',
    emailSubject: '🏠 Welcome to VaazhgaValamudan!',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['user_name', 'user_email'],
    actionUrl: '/explore',
    requiresPaid: false,
  },

  // Profile incomplete
  PROFILE_INCOMPLETE: {
    code: 'PROFILE_INCOMPLETE',
    name: 'Complete Your Profile',
    category: NotificationCategory.ACCOUNT,
    title: 'Complete Your Profile',
    body: 'Your profile is {{completion_percent}}% complete. Add missing details for better experience.',
    icon: 'profile-incomplete',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE],
    variables: ['completion_percent', 'missing_fields'],
    actionUrl: '/profile/edit',
    requiresPaid: false,
  },

  // KYC submitted
  KYC_SUBMITTED: {
    code: 'KYC_SUBMITTED',
    name: 'KYC Submitted',
    category: NotificationCategory.ACCOUNT,
    title: 'KYC Documents Submitted',
    body: 'Your KYC documents have been submitted for verification. We\'ll update you within 24 hours.',
    icon: 'kyc-pending',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['document_type'],
    actionUrl: '/profile/kyc',
    requiresPaid: false,
  },

  // KYC approved
  KYC_APPROVED: {
    code: 'KYC_APPROVED',
    name: 'KYC Approved',
    category: NotificationCategory.ACCOUNT,
    title: 'KYC Verified ✅',
    body: 'Welcome {{user_name}}!\n\nYour Aadhaar verification has been completed successfully.\n\nYou now have full access to Vaazhga Valamudan Digital Realty Solutions.\n\nStart exploring verified homes, plots, agricultural and farm land opportunities across Tamil Nadu — connect with genuine listings, trusted agents, and transparent processes.\n\nWe\'re excited to have you with us. Go ahead and explore with confidence!',
    icon: 'kyc-approved',
    emailSubject: '✅ KYC Verification Complete',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['user_name'],
    actionUrl: '/profile',
    requiresPaid: false,
  },

  // KYC rejected
  KYC_REJECTED: {
    code: 'KYC_REJECTED',
    name: 'KYC Rejected',
    category: NotificationCategory.ACCOUNT,
    title: 'KYC Verification Failed',
    body: 'Your KYC verification was not successful. Reason: {{rejection_reason}}. Please resubmit.',
    icon: 'kyc-rejected',
    emailSubject: '⚠️ KYC Verification Failed - Please Resubmit',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['rejection_reason'],
    actionUrl: '/profile/kyc/resubmit',
    requiresPaid: false,
  },

  // Password changed
  PASSWORD_CHANGED: {
    code: 'PASSWORD_CHANGED',
    name: 'Password Changed',
    category: NotificationCategory.ACCOUNT,
    title: 'Password Changed',
    body: 'Your password was changed successfully. If this wasn\'t you, contact support immediately.',
    icon: 'security',
    emailSubject: '🔒 Password Changed - VaazhgaValamudan',
    channels: [NotificationChannel.EMAIL],
    variables: ['changed_at', 'ip_address'],
    requiresPaid: false,
  },

  // New device login
  NEW_DEVICE_LOGIN: {
    code: 'NEW_DEVICE_LOGIN',
    name: 'New Device Login',
    category: NotificationCategory.ACCOUNT,
    title: 'New Login Detected',
    body: 'A new login was detected from {{device_name}} in {{location}}. If this wasn\'t you, secure your account.',
    icon: 'security',
    emailSubject: '🔔 New Login Detected',
    channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
    variables: ['device_name', 'location', 'ip_address', 'login_time'],
    actionUrl: '/settings/security',
    requiresPaid: false,
  },

  // Agent profile approved
  AGENT_APPROVED: {
    code: 'AGENT_APPROVED',
    name: 'Agent Profile Approved',
    category: NotificationCategory.ACCOUNT,
    title: 'Agent Profile Approved! 🎉',
    body: 'Congratulations! You\'re now a verified agent. Start listing properties to reach buyers.',
    icon: 'agent-approved',
    emailSubject: '🎉 Welcome, Verified Agent!',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['agent_name'],
    actionUrl: '/agent/dashboard',
    requiresPaid: false,
  },
};

export const AD_TEMPLATES: Record<string, NotificationTemplateConfig> = {
  AD_CREATED_OWNER: {
    code: 'AD_CREATED_OWNER',
    name: 'Ad Submitted (Owner)',
    category: NotificationCategory.AD,
    title: 'Ad Submitted for Review',
    body: 'Your ad "{{ad_title}}" has been submitted and is under review.',
    icon: 'ad-pending',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['ad_title', 'ad_id'],
    actionUrl: '/my-ads/{{ad_id}}',
    requiresPaid: false,
  },

  AD_CREATED_ADMIN: {
    code: 'AD_CREATED_ADMIN',
    name: 'New Ad Pending (Admin)',
    category: NotificationCategory.AD,
    title: 'New Ad Pending Approval',
    body: 'New ad "{{ad_title}}" by {{owner_name}} needs approval.',
    icon: 'ad-review',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['ad_title', 'ad_id', 'owner_name', 'owner_id'],
    actionUrl: '/admin/ads/{{ad_id}}/review',
    requiresPaid: false,
    targetRoles: ['ADMIN'],
  },

  AD_APPROVED: {
    code: 'AD_APPROVED',
    name: 'Ad Approved',
    category: NotificationCategory.AD,
    title: 'Ad Approved! 🎉',
    body: 'Your ad "{{ad_title}}" is now live!',
    icon: 'ad-approved',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH, NotificationChannel.EMAIL],
    variables: ['ad_title', 'ad_id', 'ad_url'],
    actionUrl: '/ads/{{ad_id}}',
    requiresPaid: false,
  },

  AD_REJECTED: {
    code: 'AD_REJECTED',
    name: 'Ad Rejected',
    category: NotificationCategory.AD,
    title: 'Ad Needs Changes',
    body: 'Your ad "{{ad_title}}" was not approved. Reason: {{rejection_reason}}',
    icon: 'ad-rejected',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['ad_title', 'ad_id', 'rejection_reason'],
    actionUrl: '/my-ads/{{ad_id}}/edit',
    requiresPaid: false,
  },

  AD_EXPIRING: {
    code: 'AD_EXPIRING',
    name: 'Ad Expiring Soon',
    category: NotificationCategory.AD,
    title: 'Ad Expiring Soon ⏰',
    body: 'Your ad "{{ad_title}}" expires in {{days_remaining}} days.',
    icon: 'ad-expiring',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.PUSH],
    variables: ['ad_title', 'ad_id', 'days_remaining'],
    actionUrl: '/my-ads/{{ad_id}}/renew',
    requiresPaid: false,
  },
};

export const SYSTEM_TEMPLATES: Record<string, NotificationTemplateConfig> = {
  SYSTEM_MAINTENANCE: {
    code: 'SYSTEM_MAINTENANCE',
    name: 'Scheduled Maintenance',
    category: NotificationCategory.SYSTEM,
    title: 'Scheduled Maintenance 🔧',
    body: 'VaazhgaValamudan will be under maintenance on {{maintenance_date}} from {{start_time}} to {{end_time}}.',
    icon: 'maintenance',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE, NotificationChannel.EMAIL],
    variables: ['maintenance_date', 'start_time', 'end_time'],
    requiresPaid: false,
  },

  SYSTEM_UPDATE: {
    code: 'SYSTEM_UPDATE',
    name: 'New Features Available',
    category: NotificationCategory.SYSTEM,
    title: 'New Features Available! 🚀',
    body: '{{feature_name}} is now available. {{feature_description}}',
    icon: 'new-feature',
    channels: [NotificationChannel.IN_APP, NotificationChannel.SSE],
    variables: ['feature_name', 'feature_description'],
    requiresPaid: false,
  },
};

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplateConfig> = {
  ...PROPERTY_TEMPLATES,
  ...ENQUIRY_TEMPLATES,
  ...PAYMENT_TEMPLATES,
  ...ACCOUNT_TEMPLATES,
  ...AD_TEMPLATES,
  ...SYSTEM_TEMPLATES,
};

// Helper to get template by code
export const getNotificationTemplate = (code: string): NotificationTemplateConfig | null => {
  return NOTIFICATION_TEMPLATES[code] || null;
};

export const getTemplatesByCategory = (category: NotificationCategory): NotificationTemplateConfig[] => {
  return Object.values(NOTIFICATION_TEMPLATES).filter(t => t.category === category);
};

export const TEMPLATE_CODES = {
  PROPERTY: Object.keys(PROPERTY_TEMPLATES),
  ENQUIRY: Object.keys(ENQUIRY_TEMPLATES),
  PAYMENT: Object.keys(PAYMENT_TEMPLATES),
  ACCOUNT: Object.keys(ACCOUNT_TEMPLATES),
  AD: Object.keys(AD_TEMPLATES),
  SYSTEM: Object.keys(SYSTEM_TEMPLATES),
};