import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../property/entities/properties.entity';
import { Ad } from '../../ads/entities/ad.entity';
import { Enquiry } from '../../user-interactions/entities/enquiry.entity';
import { Favorite } from '../../user-interactions/entities/favorite.entity';
import { SavedSearch } from '../../search/entities/saved-search.entity';
import { EntityView } from '../../user-interactions/entities/entity-view.entity';
import { PropertyReport } from '../../property/entities/property-report.entity';
import { AdReport } from '../../ads/entities/ad-report.entity';
import { UserSubscription } from '../../subscription/entities/user-subscription.entity';
import { LeadStatus } from '../../user-interactions/entities/lead-status.entity';
import { KycVerification } from '../../kyc/entities/kyc-verification.entity';
import { UserType } from '../../users/enums/usertype';
import {
  BuyerDashboardDto,
  AgentDashboardDto,
  AdminDashboardDto,
  DashboardResponseDto,
  WalletTransactionDto
} from '../dto/dashboard-response.dto';
import { UserWallet } from '../../payment/entities/user-wallets.entity';
import { WalletTransaction } from '../../payment/entities/wallet-transactions.entity';
import { PaymentOrder } from '../../payment/entities/payment-orders.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(Enquiry)
    private readonly enquiryRepo: Repository<Enquiry>,
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(SavedSearch)
    private readonly savedSearchRepo: Repository<SavedSearch>,
    @InjectRepository(EntityView)
    private readonly entityViewRepo: Repository<EntityView>,
    @InjectRepository(PropertyReport)
    private readonly propertyReportRepo: Repository<PropertyReport>,
    @InjectRepository(AdReport)
    private readonly adReportRepo: Repository<AdReport>,
    @InjectRepository(UserWallet)
    private readonly walletRepo: Repository<UserWallet>,
    @InjectRepository(WalletTransaction)
    private readonly walletTxRepo: Repository<WalletTransaction>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepo: Repository<UserSubscription>,
    @InjectRepository(PaymentOrder)
    private readonly paymentOrderRepo: Repository<PaymentOrder>,
    @InjectRepository(LeadStatus)
    private readonly leadStatusRepo: Repository<LeadStatus>,
    @InjectRepository(KycVerification)
    private readonly kycRepo: Repository<KycVerification>
  ) {}

  /**
   * Get dashboard data based on user role
   * Returns role-specific dashboard data
   */
  async getDashboard(user: { id: string; roles: string[] }): Promise<DashboardResponseDto> {
    const roles = user.roles || [UserType.BUYER];

    // Determine primary role (priority: ADMIN > AGENT > BUYER)
    let primaryRole = UserType.BUYER;
    if (roles.includes(UserType.ADMIN)) {
      primaryRole = UserType.ADMIN;
    } else if (roles.includes(UserType.AGENT)) {
      primaryRole = UserType.AGENT;
    }

    const response: DashboardResponseDto = {
      userRole: primaryRole
    };

    // Get dashboard based on role
    switch (primaryRole) {
      case UserType.ADMIN:
        response.admin = await this.getAdminDashboard();
        break;
      case UserType.AGENT:
        response.agent = await this.getAgentDashboard(user.id);
        break;
      case UserType.BUYER:
      default:
        response.buyer = await this.getBuyerDashboard(user.id);
        break;
    }

    return response;
  }

  // ==================== BUYER DASHBOARD ====================

  private async getBuyerDashboard(userId: string): Promise<BuyerDashboardDto> {
    const [
      quickStats,
      enquiryStats,
      recentFavorites,
      recentViews,
      wallet
    ] = await Promise.all([
      this.getBuyerQuickStats(userId),
      this.getBuyerEnquiryStats(userId),
      this.getBuyerRecentFavorites(userId),
      this.getBuyerRecentViews(userId),
      this.getWalletSummary(userId)
    ]);

    return {
      role: 'BUYER',
      quickStats,
      enquiryStats,
      recentFavorites,
      recentViews,
      wallet
    };
  }

  private async getBuyerQuickStats(userId: string) {
    const [savedSearches, favoriteProperties, favoriteAds, enquiriesSent, propertiesViewed] = await Promise.all([
      this.savedSearchRepo.count({ where: { user_id: userId, is_active: true } }),
      this.favoriteRepo.count({ where: { user_id: userId, entity_type: 'property' } }),
      this.favoriteRepo.count({ where: { user_id: userId, entity_type: 'ad' } }),
      this.enquiryRepo.count({ where: { user_id: userId } }),
      this.entityViewRepo.count({ where: { user_id: userId, entity_type: 'property' } })
    ]);

    return {
      savedSearches,
      favoriteProperties,
      favoriteAds,
      enquiriesSent,
      propertiesViewed
    };
  }

  private async getBuyerEnquiryStats(userId: string) {
    const enquiries = await this.enquiryRepo
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('e.user_id = :userId', { userId })
      .groupBy('e.status')
      .getRawMany();

    const statusMap: Record<string, number> = {};
    enquiries.forEach(e => {
      statusMap[e.status] = Number(e.count);
    });

    return {
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      newCount: statusMap['new'] || 0,
      respondedCount: statusMap['responded'] || 0,
      closedCount: statusMap['closed'] || 0
    };
  }

  private async getBuyerRecentFavorites(userId: string) {
    const favorites = await this.favoriteRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 5
    });

    return favorites.map(f => ({
      id: f.id,
      entityType: f.entity_type,
      entityId: f.entity_id,
      createdAt: f.created_at
    }));
  }

  private async getBuyerRecentViews(userId: string) {
    const views = await this.entityViewRepo.find({
      where: { user_id: userId },
      order: { last_viewed_at: 'DESC' },
      take: 5
    });

    return views.map(v => ({
      id: v.id,
      entityType: v.entity_type,
      entityId: v.entity_id,
      createdAt: v.last_viewed_at
    }));
  }

  // ==================== AGENT DASHBOARD ====================

  private async getAgentDashboard(userId: string): Promise<AgentDashboardDto> {
    const [
      propertyStats,
      adStats,
      engagementStats,
      enquiryStats,
      leadStats,
      reportStats,
      recentEnquiries,
      wallet,
      recentTransactions,
      subscription
    ] = await Promise.all([
      this.getAgentPropertyStats(userId),
      this.getAgentAdStats(userId),
      this.getAgentEngagementStats(userId),
      this.getAgentEnquiryStats(userId),
      this.getAgentLeadStats(userId),
      this.getAgentReportStats(userId),
      this.getAgentRecentEnquiries(userId),
      this.getWalletSummary(userId),
      this.getRecentTransactions(userId),
      this.getSubscriptionSummary(userId)
    ]);

    return {
      role: 'AGENT',
      propertyStats,
      adStats,
      engagementStats,
      enquiryStats,
      leadStats,
      reportStats,
      recentEnquiries,
      wallet,
      recentTransactions,
      subscription
    };
  }

  private async getAgentPropertyStats(userId: string) {
    // Get properties where user is owner or agent
    const properties = await this.propertyRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('p.approval_status', 'approval_status')
      .addSelect('p.listing_type', 'listing_type')
      .addSelect('p.is_boosted', 'is_boosted')
      .addSelect('p.is_premium', 'is_premium')
      .addSelect('p.is_featured', 'is_featured')
      .addSelect('p.is_top_listing', 'is_top_listing')
      .addSelect('COUNT(*)', 'count')
      .where('(p.owner_id = :userId OR p.agent_id = :userId)', { userId })
      .andWhere('p.is_active = true')
      .groupBy('p.status')
      .addGroupBy('p.approval_status')
      .addGroupBy('p.listing_type')
      .addGroupBy('p.is_boosted')
      .addGroupBy('p.is_premium')
      .addGroupBy('p.is_featured')
      .addGroupBy('p.is_top_listing')
      .getRawMany();

    // Calculate stats
    let total = 0, active = 0, sold = 0, rented = 0;
    let approved = 0, underReview = 0, rejected = 0;
    let sale = 0, rent = 0, lease = 0;
    let boosted = 0, premium = 0, featured = 0, topListing = 0;

    properties.forEach(p => {
      const count = Number(p.count);
      total += count;

      // By status
      if (p.status === 'AVAILABLE') active += count;
      if (p.status === 'SOLD') sold += count;
      if (p.status === 'RENTED') rented += count;

      // By approval
      if (p.approval_status === 'APPROVED') approved += count;
      if (p.approval_status === 'UNDER_REVIEW') underReview += count;
      if (p.approval_status === 'REJECTED') rejected += count;

      // By listing type
      if (p.listing_type === 'SALE') sale += count;
      if (p.listing_type === 'RENT') rent += count;
      if (p.listing_type === 'LEASE') lease += count;

      // Boost stats
      if (p.is_boosted) boosted += count;
      if (p.is_premium) premium += count;
      if (p.is_featured) featured += count;
      if (p.is_top_listing) topListing += count;
    });

    return {
      total,
      active,
      sold,
      rented,
      byApprovalStatus: { approved, underReview, rejected },
      byListingType: { sale, rent, lease },
      boostedStats: { boosted, premium, featured, topListing }
    };
  }

  private async getAgentAdStats(userId: string) {
    const ads = await this.adRepo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('a.approval_status', 'approval_status')
      .addSelect('a.is_boosted', 'is_boosted')
      .addSelect('a.is_premium', 'is_premium')
      .addSelect('a.is_featured', 'is_featured')
      .addSelect('a.is_top_listing', 'is_top_listing')
      .addSelect('COUNT(*)', 'count')
      .where('a.owner_id = :userId', { userId })
      .andWhere('a.is_active = true')
      .groupBy('a.status')
      .addGroupBy('a.approval_status')
      .addGroupBy('a.is_boosted')
      .addGroupBy('a.is_premium')
      .addGroupBy('a.is_featured')
      .addGroupBy('a.is_top_listing')
      .getRawMany();

    let total = 0, active = 0, sold = 0;
    let approved = 0, underReview = 0, rejected = 0;
    let boosted = 0, premium = 0, featured = 0, topListing = 0;

    ads.forEach(a => {
      const count = Number(a.count);
      total += count;

      if (a.status === 'AVAILABLE') active += count;
      if (a.status === 'SOLD') sold += count;

      if (a.approval_status === 'APPROVED') approved += count;
      if (a.approval_status === 'UNDER_REVIEW') underReview += count;
      if (a.approval_status === 'REJECTED') rejected += count;

      if (a.is_boosted) boosted += count;
      if (a.is_premium) premium += count;
      if (a.is_featured) featured += count;
      if (a.is_top_listing) topListing += count;
    });

    return {
      total,
      active,
      sold,
      byApprovalStatus: { approved, underReview, rejected },
      boostedStats: { boosted, premium, featured, topListing }
    };
  }

  private async getAgentEngagementStats(userId: string) {
    // Property engagement
    const propertyStats = await this.propertyRepo
      .createQueryBuilder('p')
      .select('SUM(p.view_count)', 'views')
      .addSelect('SUM(p.favorite_count)', 'favorites')
      .addSelect('SUM(p.contact_count)', 'contacts')
      .where('(p.owner_id = :userId OR p.agent_id = :userId)', { userId })
      .andWhere('p.is_active = true')
      .getRawOne();

    // Ad engagement
    const adStats = await this.adRepo
      .createQueryBuilder('a')
      .select('SUM(a.view_count)', 'views')
      .addSelect('SUM(a.favorite_count)', 'favorites')
      .addSelect('SUM(a.contact_count)', 'contacts')
      .addSelect('SUM(a.click_count)', 'clicks')
      .where('a.owner_id = :userId', { userId })
      .andWhere('a.is_active = true')
      .getRawOne();

    return {
      totalViews: Number(propertyStats?.views || 0) + Number(adStats?.views || 0),
      totalFavorites: Number(propertyStats?.favorites || 0) + Number(adStats?.favorites || 0),
      totalContacts: Number(propertyStats?.contacts || 0) + Number(adStats?.contacts || 0),
      totalClicks: Number(adStats?.clicks || 0)
    };
  }

  private async getAgentEnquiryStats(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get enquiries for agent's properties and ads
    const enquiries = await this.enquiryRepo
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('e.entity_type', 'entity_type')
      .addSelect('COUNT(*)', 'count')
      .where(`(
        (e.entity_type = 'property' AND e.entity_id IN (
          SELECT p.id FROM properties p WHERE p.owner_id = :userId OR p.agent_id = :userId
        ))
        OR
        (e.entity_type = 'ad' AND e.entity_id IN (
          SELECT a.id FROM ads a WHERE a.owner_id = :userId
        ))
      )`, { userId })
      .groupBy('e.status')
      .addGroupBy('e.entity_type')
      .getRawMany();

    // New enquiries last 7 days
    const newEnquiries = await this.enquiryRepo
      .createQueryBuilder('e')
      .where(`(
        (e.entity_type = 'property' AND e.entity_id IN (
          SELECT p.id FROM properties p WHERE p.owner_id = :userId OR p.agent_id = :userId
        ))
        OR
        (e.entity_type = 'ad' AND e.entity_id IN (
          SELECT a.id FROM ads a WHERE a.owner_id = :userId
        ))
      )`, { userId })
      .andWhere('e.created_at >= :sevenDaysAgo', { sevenDaysAgo })
      .getCount();

    let total = 0;
    const byStatus = { new: 0, read: 0, responded: 0, closed: 0 };
    const byEntityType = { property: 0, ad: 0 };

    enquiries.forEach(e => {
      const count = Number(e.count);
      total += count;

      if (byStatus.hasOwnProperty(e.status)) {
        byStatus[e.status as keyof typeof byStatus] += count;
      }
      if (byEntityType.hasOwnProperty(e.entity_type)) {
        byEntityType[e.entity_type as keyof typeof byEntityType] += count;
      }
    });

    return {
      total,
      newLast7Days: newEnquiries,
      byStatus,
      byEntityType
    };
  }

  private async getAgentLeadStats(userId: string) {
    const now = new Date();

    // Get leads assigned to this user
    const leads = await this.leadStatusRepo
      .createQueryBuilder('l')
      .where('l.assigned_to_id = :userId', { userId })
      .getMany();

    const pendingFollowUp = leads.filter(l =>
      l.follow_up_date && new Date(l.follow_up_date) > now
    ).length;

    const overdueFollowUp = leads.filter(l =>
      l.follow_up_date && new Date(l.follow_up_date) < now
    ).length;

    return {
      total: leads.length,
      pendingFollowUp,
      overdueFollowUp
    };
  }

  private async getAgentReportStats(userId: string) {
    // Property reports
    const propertyReports = await this.propertyReportRepo
      .createQueryBuilder('r')
      .innerJoin('r.property', 'p')
      .where('(p.owner_id = :userId OR p.agent_id = :userId)', { userId })
      .getCount();

    // Ad reports
    const adReports = await this.adReportRepo
      .createQueryBuilder('r')
      .innerJoin('r.ad', 'a')
      .where('a.owner_id = :userId', { userId })
      .getCount();

    // Pending reports
    const pendingPropertyReports = await this.propertyReportRepo
      .createQueryBuilder('r')
      .innerJoin('r.property', 'p')
      .where('(p.owner_id = :userId OR p.agent_id = :userId)', { userId })
      .andWhere('r.status = :status', { status: 'PENDING' })
      .getCount();

    const pendingAdReports = await this.adReportRepo
      .createQueryBuilder('r')
      .innerJoin('r.ad', 'a')
      .where('a.owner_id = :userId', { userId })
      .andWhere('r.status = :status', { status: 'PENDING' })
      .getCount();

    return {
      propertyReports,
      adReports,
      pendingReports: pendingPropertyReports + pendingAdReports
    };
  }

  private async getAgentRecentEnquiries(userId: string) {
    const enquiries = await this.enquiryRepo
      .createQueryBuilder('e')
      .where(`(
        (e.entity_type = 'property' AND e.entity_id IN (
          SELECT p.id FROM properties p WHERE p.owner_id = :userId OR p.agent_id = :userId
        ))
        OR
        (e.entity_type = 'ad' AND e.entity_id IN (
          SELECT a.id FROM ads a WHERE a.owner_id = :userId
        ))
      )`, { userId })
      .orderBy('e.created_at', 'DESC')
      .take(5)
      .getMany();

    return enquiries.map(e => ({
      id: e.id,
      name: e.name,
      entityType: e.entity_type,
      status: e.status,
      createdAt: e.created_at
    }));
  }

  // ==================== COMMON METHODS ====================

  private async getWalletSummary(userId: string) {
    const wallet = await this.walletRepo.findOne({
      where: { user_id: userId }
    });

    return {
      balance: Number(wallet?.balance || 0),
      lifetimeCredited: Number(wallet?.lifetime_credited || 0),
      lifetimeDebited: Number(wallet?.lifetime_debited || 0),
      lifetimeExpired: Number(wallet?.lifetime_expired || 0)
    };
  }

  private async getRecentTransactions(userId: string): Promise<WalletTransactionDto[]> {
    const wallet = await this.walletRepo.findOne({
      where: { user_id: userId }
    });

    if (!wallet) return [];

    const transactions = await this.walletTxRepo.find({
      where: { user_wallet_id: wallet.id },
      order: { created_at: 'DESC' },
      take: 5
    });

    return transactions.map(
      (t): WalletTransactionDto => ({
        id: t.id,
        type: t.type,
        source: t.source,
        amount: Number(t.amount),
        balanceAfter: Number(t.balance_after),
        description: t.description ?? undefined,
        createdAt: t.created_at
      })
    );
  }

  private async getSubscriptionSummary(userId: string) {
    const subscription = await this.subscriptionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.plan', 'plan')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.isActive = true')
      .orderBy('s.endDate', 'DESC')
      .getOne();

    if (!subscription) {
      return {
        hasActiveSubscription: false
      };
    }

    const now = new Date();
    const endDate = new Date(subscription.endDate);
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      hasActiveSubscription: true,
      planName: subscription.plan?.name,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      daysRemaining: Math.max(0, daysRemaining),
      status: subscription.status
    };
  }

  // ==================== ADMIN DASHBOARD ====================

  private async getAdminDashboard(): Promise<AdminDashboardDto> {
    const [
      userStats,
      propertyStats,
      adStats,
      engagementStats,
      moderationStats,
      revenueStats,
      subscriptionStats,
      recentUsers,
      recentPayments
    ] = await Promise.all([
      this.getAdminUserStats(),
      this.getAdminPropertyStats(),
      this.getAdminAdStats(),
      this.getAdminEngagementStats(),
      this.getAdminModerationStats(),
      this.getAdminRevenueStats(),
      this.getAdminSubscriptionStats(),
      this.getAdminRecentUsers(),
      this.getAdminRecentPayments()
    ]);

    return {
      role: 'ADMIN',
      userStats,
      propertyStats,
      adStats,
      engagementStats,
      moderationStats,
      revenueStats,
      subscriptionStats,
      recentUsers,
      recentPayments
    };
  }

  private async getAdminUserStats() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [total, newLast7Days, newLast30Days, kycVerified, kycPending] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { createdAt: MoreThanOrEqual(sevenDaysAgo) } }),
      this.userRepo.count({ where: { createdAt: MoreThanOrEqual(thirtyDaysAgo) } }),
      this.userRepo.count({ where: { isKycVerified: true } }),
      this.kycRepo.count({ where: { status: 'PENDING' as any } })
    ]);

    // Count by role
    const users = await this.userRepo.find({ select: ['roles'] });
    let buyers = 0, agents = 0, admins = 0;
    users.forEach(u => {
      if (u.roles?.includes(UserType.ADMIN)) admins++;
      if (u.roles?.includes(UserType.AGENT)) agents++;
      if (u.roles?.includes(UserType.BUYER)) buyers++;
    });

    return {
      total,
      byRole: { buyers, agents, admins },
      newLast7Days,
      newLast30Days,
      kycVerified,
      kycPending
    };
  }

  private async getAdminPropertyStats() {
    const properties = await this.propertyRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('p.approval_status', 'approval_status')
      .addSelect('p.is_published', 'is_published')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .addGroupBy('p.approval_status')
      .addGroupBy('p.is_published')
      .getRawMany();

    let total = 0, published = 0, draft = 0;
    const byStatus = { available: 0, sold: 0, rented: 0, withdrawn: 0 };
    const byApprovalStatus = { approved: 0, underReview: 0, rejected: 0 };

    properties.forEach(p => {
      const count = Number(p.count);
      total += count;

      if (p.is_published) published += count;
      else draft += count;

      if (p.status === 'AVAILABLE') byStatus.available += count;
      if (p.status === 'SOLD') byStatus.sold += count;
      if (p.status === 'RENTED') byStatus.rented += count;
      if (p.status === 'WITHDRAWN') byStatus.withdrawn += count;

      if (p.approval_status === 'APPROVED') byApprovalStatus.approved += count;
      if (p.approval_status === 'UNDER_REVIEW') byApprovalStatus.underReview += count;
      if (p.approval_status === 'REJECTED') byApprovalStatus.rejected += count;
    });

    return {
      total,
      byStatus,
      byApprovalStatus,
      published,
      draft
    };
  }

  private async getAdminAdStats() {
    const ads = await this.adRepo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('a.approval_status', 'approval_status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.status')
      .addGroupBy('a.approval_status')
      .getRawMany();

    let total = 0;
    const byStatus = { available: 0, sold: 0, reserved: 0 };
    const byApprovalStatus = { approved: 0, underReview: 0, rejected: 0 };

    ads.forEach(a => {
      const count = Number(a.count);
      total += count;

      if (a.status === 'AVAILABLE') byStatus.available += count;
      if (a.status === 'SOLD') byStatus.sold += count;
      if (a.status === 'RESERVED') byStatus.reserved += count;

      if (a.approval_status === 'APPROVED') byApprovalStatus.approved += count;
      if (a.approval_status === 'UNDER_REVIEW') byApprovalStatus.underReview += count;
      if (a.approval_status === 'REJECTED') byApprovalStatus.rejected += count;
    });

    return {
      total,
      byStatus,
      byApprovalStatus
    };
  }

  private async getAdminEngagementStats() {
    const [propertyStats, adStats, totalEnquiries, totalFavorites] = await Promise.all([
      this.propertyRepo
        .createQueryBuilder('p')
        .select('SUM(p.view_count)', 'views')
        .getRawOne(),
      this.adRepo
        .createQueryBuilder('a')
        .select('SUM(a.view_count)', 'views')
        .getRawOne(),
      this.enquiryRepo.count(),
      this.favoriteRepo.count()
    ]);

    return {
      totalPropertyViews: Number(propertyStats?.views || 0),
      totalAdViews: Number(adStats?.views || 0),
      totalEnquiries,
      totalFavorites
    };
  }

  private async getAdminModerationStats() {
    const [
      propertyReportsPending,
      adReportsPending,
      highSeverityReports,
      propertyApprovalsTotal,
      adApprovalsTotal
    ] = await Promise.all([
      this.propertyReportRepo.count({ where: { status: 'PENDING' } }),
      this.adReportRepo.count({ where: { status: 'PENDING' } }),
      this.propertyReportRepo.count({ where: { status: 'PENDING', severity: MoreThanOrEqual(4) } }),
      this.propertyRepo.count({ where: { approval_status: 'UNDER_REVIEW' } }),
      this.adRepo.count({ where: { approval_status: 'UNDER_REVIEW' } })
    ]);

    return {
      propertyReportsPending,
      adReportsPending,
      highSeverityReports,
      propertyApprovalsTotal,
      adApprovalsTotal
    };
  }

  private async getAdminRevenueStats() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalStats, last30DaysStats, orderCounts] = await Promise.all([
      this.paymentOrderRepo
        .createQueryBuilder('o')
        .select('SUM(o.payable_amount)', 'total')
        .where('o.status = :status', { status: 'COMPLETED' })
        .getRawOne(),
      this.paymentOrderRepo
        .createQueryBuilder('o')
        .select('SUM(o.payable_amount)', 'total')
        .where('o.status = :status', { status: 'COMPLETED' })
        .andWhere('o.created_at >= :date', { date: thirtyDaysAgo })
        .getRawOne(),
      this.paymentOrderRepo
        .createQueryBuilder('o')
        .select('o.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('o.status')
        .getRawMany()
    ]);

    // By purpose
    const byPurpose = await this.paymentOrderRepo
      .createQueryBuilder('o')
      .select('o.purpose', 'purpose')
      .addSelect('SUM(o.payable_amount)', 'total')
      .where('o.status = :status', { status: 'COMPLETED' })
      .groupBy('o.purpose')
      .getRawMany();

    const purposeMap: Record<string, number> = {};
    byPurpose.forEach(p => {
      purposeMap[p.purpose?.toLowerCase() || 'other'] = Number(p.total || 0);
    });

    const statusMap: Record<string, number> = {};
    orderCounts.forEach(o => {
      statusMap[o.status] = Number(o.count);
    });

    return {
      totalRevenue: Number(totalStats?.total || 0),
      revenueLast30Days: Number(last30DaysStats?.total || 0),
      totalOrders: Object.values(statusMap).reduce((a, b) => a + b, 0),
      completedOrders: statusMap['COMPLETED'] || 0,
      byPurpose: {
        subscription: purposeMap['subscription'] || 0,
        boost: purposeMap['boost'] || 0,
        topListing: purposeMap['top_listing'] || 0,
        wallet: purposeMap['wallet'] || 0
      }
    };
  }

  private async getAdminSubscriptionStats() {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const [activeSubscriptions, expiringSoon, byPlan] = await Promise.all([
      this.subscriptionRepo.count({ where: { isActive: true } }),
      this.subscriptionRepo.count({
        where: {
          isActive: true,
          endDate: LessThanOrEqual(sevenDaysFromNow)
        }
      }),
      this.subscriptionRepo
        .createQueryBuilder('s')
        .leftJoin('s.plan', 'plan')
        .select('plan.name', 'planName')
        .addSelect('COUNT(*)', 'count')
        .where('s.isActive = true')
        .groupBy('plan.name')
        .getRawMany()
    ]);

    return {
      activeSubscriptions,
      expiringSoon,
      byPlan: byPlan.map(p => ({
        planName: p.planName || 'Unknown',
        count: Number(p.count)
      }))
    };
  }

  private async getAdminRecentUsers() {
    const users = await this.userRepo.find({
      order: { createdAt: 'DESC' },
      take: 5
    });

    return users.map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      roles: u.roles,
      createdAt: u.createdAt
    }));
  }

  private async getAdminRecentPayments() {
    const payments = await this.paymentOrderRepo.find({
      where: { status: 'COMPLETED' },
      order: { created_at: 'DESC' },
      take: 5
    });

    return payments.map(p => ({
      id: p.id,
      orderNumber: p.order_number,
      amount: Number(p.payable_amount),
      status: p.status,
      purpose: p.purpose,
      createdAt: p.created_at
    }));
  }
}