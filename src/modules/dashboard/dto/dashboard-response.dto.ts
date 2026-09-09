import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== COMMON DTOs ====================

export class WalletSummaryDto {
  @ApiProperty({ example: 5000 })
  balance: number;

  @ApiProperty({ example: 15000 })
  lifetimeCredited: number;

  @ApiProperty({ example: 10000 })
  lifetimeDebited: number;

  @ApiProperty({ example: 500 })
  lifetimeExpired: number;
}

export class WalletTransactionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'CREDIT' })
  type: string;

  @ApiProperty({ example: 'REFERRAL' })
  source: string;

  @ApiProperty({ example: 500 })
  amount: number;

  @ApiProperty({ example: 5500 })
  balanceAfter: number;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  createdAt: Date;
}

export class SubscriptionSummaryDto {
  @ApiProperty({ example: true })
  hasActiveSubscription: boolean;

  @ApiPropertyOptional({ example: 'Premium Plan' })
  planName?: string;

  @ApiPropertyOptional()
  startDate?: Date;

  @ApiPropertyOptional()
  endDate?: Date;

  @ApiPropertyOptional({ example: 15 })
  daysRemaining?: number;

  @ApiPropertyOptional({ example: 'active' })
  status?: string;
}

// ==================== BUYER DASHBOARD ====================

export class BuyerQuickStatsDto {
  @ApiProperty({ example: 5 })
  savedSearches: number;

  @ApiProperty({ example: 12 })
  favoriteProperties: number;

  @ApiProperty({ example: 3 })
  favoriteAds: number;

  @ApiProperty({ example: 8 })
  enquiriesSent: number;

  @ApiProperty({ example: 45 })
  propertiesViewed: number;
}

export class BuyerEnquiryStatsDto {
  @ApiProperty({ example: 8 })
  total: number;

  @ApiProperty({ example: 2 })
  newCount: number;

  @ApiProperty({ example: 3 })
  respondedCount: number;

  @ApiProperty({ example: 3 })
  closedCount: number;
}

export class RecentActivityItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'property' })
  entityType: string;

  @ApiProperty()
  entityId: string;

  @ApiPropertyOptional({ example: '3 BHK Apartment' })
  title?: string;

  @ApiProperty()
  createdAt: Date;
}

export class BuyerDashboardDto {
  @ApiProperty({ example: 'BUYER' })
  role: string;

  @ApiProperty({ type: BuyerQuickStatsDto })
  quickStats: BuyerQuickStatsDto;

  @ApiProperty({ type: BuyerEnquiryStatsDto })
  enquiryStats: BuyerEnquiryStatsDto;

  @ApiProperty({ type: [RecentActivityItemDto] })
  recentFavorites: RecentActivityItemDto[];

  @ApiProperty({ type: [RecentActivityItemDto] })
  recentViews: RecentActivityItemDto[];

  @ApiProperty({ type: WalletSummaryDto })
  wallet: WalletSummaryDto;
}

// ==================== AGENT DASHBOARD ====================

export class PropertyStatsDto {
  @ApiProperty({ example: 25 })
  total: number;

  @ApiProperty({ example: 18 })
  active: number;

  @ApiProperty({ example: 5 })
  sold: number;

  @ApiProperty({ example: 2 })
  rented: number;

  @ApiProperty()
  byApprovalStatus: {
    approved: number;
    underReview: number;
    rejected: number;
  };

  @ApiProperty()
  byListingType: {
    sale: number;
    rent: number;
    lease: number;
  };

  @ApiProperty()
  boostedStats: {
    boosted: number;
    premium: number;
    featured: number;
    topListing: number;
  };
}

export class AdStatsDto {
  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 8 })
  active: number;

  @ApiProperty({ example: 2 })
  sold: number;

  @ApiProperty()
  byApprovalStatus: {
    approved: number;
    underReview: number;
    rejected: number;
  };

  @ApiProperty()
  boostedStats: {
    boosted: number;
    premium: number;
    featured: number;
    topListing: number;
  };
}

export class EngagementStatsDto {
  @ApiProperty({ example: 1250 })
  totalViews: number;

  @ApiProperty({ example: 89 })
  totalFavorites: number;

  @ApiProperty({ example: 45 })
  totalContacts: number;

  @ApiProperty({ example: 12 })
  totalClicks: number;
}

export class EnquiryStatsDto {
  @ApiProperty({ example: 45 })
  total: number;

  @ApiProperty({ example: 8 })
  newLast7Days: number;

  @ApiProperty()
  byStatus: {
    new: number;
    read: number;
    responded: number;
    closed: number;
  };

  @ApiProperty()
  byEntityType: {
    property: number;
    ad: number;
  };
}

export class LeadStatsDto {
  @ApiProperty({ example: 15 })
  total: number;

  @ApiProperty({ example: 5 })
  pendingFollowUp: number;

  @ApiProperty({ example: 3 })
  overdueFollowUp: number;
}

export class ReportStatsDto {
  @ApiProperty({ example: 2 })
  propertyReports: number;

  @ApiProperty({ example: 1 })
  adReports: number;

  @ApiProperty({ example: 1 })
  pendingReports: number;
}

export class RecentEnquiryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'property' })
  entityType: string;

  @ApiProperty({ example: 'new' })
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class AgentDashboardDto {
  @ApiProperty({ example: 'AGENT' })
  role: string;

  @ApiProperty({ type: PropertyStatsDto })
  propertyStats: PropertyStatsDto;

  @ApiProperty({ type: AdStatsDto })
  adStats: AdStatsDto;

  @ApiProperty({ type: EngagementStatsDto })
  engagementStats: EngagementStatsDto;

  @ApiProperty({ type: EnquiryStatsDto })
  enquiryStats: EnquiryStatsDto;

  @ApiProperty({ type: LeadStatsDto })
  leadStats: LeadStatsDto;

  @ApiProperty({ type: ReportStatsDto })
  reportStats: ReportStatsDto;

  @ApiProperty({ type: [RecentEnquiryDto] })
  recentEnquiries: RecentEnquiryDto[];

  @ApiProperty({ type: WalletSummaryDto })
  wallet: WalletSummaryDto;

  @ApiProperty({ type: [WalletTransactionDto] })
  recentTransactions: WalletTransactionDto[];

  @ApiProperty({ type: SubscriptionSummaryDto })
  subscription: SubscriptionSummaryDto;
}

// ==================== ADMIN DASHBOARD ====================

export class UserStatsDto {
  @ApiProperty({ example: 15000 })
  total: number;

  @ApiProperty()
  byRole: {
    buyers: number;
    agents: number;
    admins: number;
  };

  @ApiProperty({ example: 150 })
  newLast7Days: number;

  @ApiProperty({ example: 500 })
  newLast30Days: number;

  @ApiProperty({ example: 8500 })
  kycVerified: number;

  @ApiProperty({ example: 25 })
  kycPending: number;
}

export class PlatformPropertyStatsDto {
  @ApiProperty({ example: 2450 })
  total: number;

  @ApiProperty()
  byStatus: {
    available: number;
    sold: number;
    rented: number;
    withdrawn: number;
  };

  @ApiProperty()
  byApprovalStatus: {
    approved: number;
    underReview: number;
    rejected: number;
  };

  @ApiProperty({ example: 1800 })
  published: number;

  @ApiProperty({ example: 650 })
  draft: number;
}

export class PlatformAdStatsDto {
  @ApiProperty({ example: 180 })
  total: number;

  @ApiProperty()
  byStatus: {
    available: number;
    sold: number;
    reserved: number;
  };

  @ApiProperty()
  byApprovalStatus: {
    approved: number;
    underReview: number;
    rejected: number;
  };
}

export class PlatformEngagementDto {
  @ApiProperty({ example: 125000 })
  totalPropertyViews: number;

  @ApiProperty({ example: 15000 })
  totalAdViews: number;

  @ApiProperty({ example: 8500 })
  totalEnquiries: number;

  @ApiProperty({ example: 12000 })
  totalFavorites: number;
}

export class ModerationStatsDto {
  @ApiProperty({ example: 15 })
  propertyReportsPending: number;

  @ApiProperty({ example: 8 })
  adReportsPending: number;

  @ApiProperty({ example: 5 })
  highSeverityReports: number;

  @ApiProperty({ example: 45 })
  propertyApprovalsTotal: number;

  @ApiProperty({ example: 12 })
  adApprovalsTotal: number;
}

export class RevenueStatsDto {
  @ApiProperty({ example: 250000 })
  totalRevenue: number;

  @ApiProperty({ example: 45000 })
  revenueLast30Days: number;

  @ApiProperty({ example: 150 })
  totalOrders: number;

  @ApiProperty({ example: 140 })
  completedOrders: number;

  @ApiProperty()
  byPurpose: {
    subscription: number;
    boost: number;
    topListing: number;
    wallet: number;
  };
}

export class PlatformSubscriptionStatsDto {
  @ApiProperty({ example: 120 })
  activeSubscriptions: number;

  @ApiProperty({ example: 15 })
  expiringSoon: number;

  @ApiProperty()
  byPlan: Array<{
    planName: string;
    count: number;
  }>;
}

export class RecentUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @ApiProperty({ example: ['BUYER'] })
  roles: string[];

  @ApiProperty()
  createdAt: Date;
}

export class RecentPaymentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'ORD-123456' })
  orderNumber: string;

  @ApiProperty({ example: 5000 })
  amount: number;

  @ApiProperty({ example: 'COMPLETED' })
  status: string;

  @ApiProperty({ example: 'SUBSCRIPTION' })
  purpose: string;

  @ApiProperty()
  createdAt: Date;
}

export class AdminDashboardDto {
  @ApiProperty({ example: 'ADMIN' })
  role: string;

  @ApiProperty({ type: UserStatsDto })
  userStats: UserStatsDto;

  @ApiProperty({ type: PlatformPropertyStatsDto })
  propertyStats: PlatformPropertyStatsDto;

  @ApiProperty({ type: PlatformAdStatsDto })
  adStats: PlatformAdStatsDto;

  @ApiProperty({ type: PlatformEngagementDto })
  engagementStats: PlatformEngagementDto;

  @ApiProperty({ type: ModerationStatsDto })
  moderationStats: ModerationStatsDto;

  @ApiProperty({ type: RevenueStatsDto })
  revenueStats: RevenueStatsDto;

  @ApiProperty({ type: PlatformSubscriptionStatsDto })
  subscriptionStats: PlatformSubscriptionStatsDto;

  @ApiProperty({ type: [RecentUserDto] })
  recentUsers: RecentUserDto[];

  @ApiProperty({ type: [RecentPaymentDto] })
  recentPayments: RecentPaymentDto[];
}

// ==================== UNIFIED RESPONSE ====================

export class DashboardResponseDto {
  @ApiProperty({ example: 'BUYER', enum: ['BUYER', 'AGENT', 'ADMIN'] })
  userRole: string;

  @ApiPropertyOptional({ type: BuyerDashboardDto })
  buyer?: BuyerDashboardDto;

  @ApiPropertyOptional({ type: AgentDashboardDto })
  agent?: AgentDashboardDto;

  @ApiPropertyOptional({ type: AdminDashboardDto })
  admin?: AdminDashboardDto;
}