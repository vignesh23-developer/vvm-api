import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================
// BADGE TYPES
// ============================================

export type BadgeType =
  | 'notifications'
  | 'favorites'
  | 'enquiries_sent'
  | 'new_enquiries'
  | 'wallet_balance'
  | 'pending_properties'
  | 'reported_properties'
  | 'pending_ads'
  | 'reported_ads'
  | 'kyc_requests';

// ============================================
// SSE BADGE UPDATE PAYLOAD
// ============================================

export interface BadgeUpdatePayload {
  type: BadgeType;
  count: number;
  timestamp: string;
}

export interface MultipleBadgeUpdatePayload {
  badges: Partial<Record<BadgeType, number>>;
  timestamp: string;
}

// ============================================
// BUYER BADGE COUNTS
// ============================================

export class BuyerBadgeCountsDto {
  @ApiProperty({ example: 'BUYER' })
  role: string;

  @ApiProperty({ example: 3, description: 'Unread notifications count' })
  notifications: number;

  @ApiProperty({ example: 5, description: 'Total favorites (properties + ads)' })
  favorites: number;

  @ApiProperty({ example: 2, description: 'Enquiries with new responses' })
  enquiriesWithResponses: number;
}

// ============================================
// AGENT BADGE COUNTS
// ============================================

export class AgentBadgeCountsDto {
  @ApiProperty({ example: 'AGENT' })
  role: string;

  @ApiProperty({ example: 5, description: 'Unread notifications count' })
  notifications: number;

  @ApiProperty({ example: 8, description: 'New enquiries (unread)' })
  newEnquiries: number;

  @ApiProperty({ example: 5000, description: 'Current wallet balance' })
  walletBalance: number;

  @ApiPropertyOptional({ example: 15, description: 'Days remaining in subscription' })
  subscriptionDaysRemaining?: number;

  @ApiPropertyOptional({ example: true, description: 'Is subscription expiring soon (<=7 days)' })
  subscriptionExpiringSoon?: boolean;
}

// ============================================
// ADMIN BADGE COUNTS
// ============================================

export class AdminModerationBadgesDto {
  @ApiProperty({ example: 8, description: 'Properties pending approval' })
  pendingProperties: number;

  @ApiProperty({ example: 2, description: 'Reported properties pending review' })
  reportedProperties: number;

  @ApiProperty({ example: 3, description: 'Ads pending approval' })
  pendingAds: number;

  @ApiProperty({ example: 1, description: 'Reported ads pending review' })
  reportedAds: number;

  @ApiProperty({ example: 5, description: 'KYC requests pending verification' })
  kycRequests: number;
}

export class AdminBadgeCountsDto {
  @ApiProperty({ example: 'ADMIN' })
  role: string;

  @ApiProperty({ example: 12, description: 'Unread notifications count' })
  notifications: number;

  @ApiProperty({ type: AdminModerationBadgesDto })
  moderation: AdminModerationBadgesDto;

  @ApiProperty({ example: 19, description: 'Total pending items requiring attention' })
  totalPendingActions: number;
}

// ============================================
// UNIFIED BADGE RESPONSE
// ============================================

export class BadgeCountsResponseDto {
  @ApiProperty({ example: 'BUYER', enum: ['BUYER', 'AGENT', 'ADMIN'] })
  role: string;

  @ApiPropertyOptional({ type: BuyerBadgeCountsDto })
  buyer?: BuyerBadgeCountsDto;

  @ApiPropertyOptional({ type: AgentBadgeCountsDto })
  agent?: AgentBadgeCountsDto;

  @ApiPropertyOptional({ type: AdminBadgeCountsDto })
  admin?: AdminBadgeCountsDto;
}