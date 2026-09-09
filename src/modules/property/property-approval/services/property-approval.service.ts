import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../../entities/properties.entity';
import { PropertyApproval } from '../../entities/property-approval.entity';
import { PropertyIndexingService } from '../../../search';
import { NotificationService } from '../../../notification/services/notification.service';
import { NotificationEntityType } from '../../../notification/enums/notification.enum';
import { User } from '../../../users/entities/user.entity';
import { UserWalletsService } from '../../../payment/user-wallets/services/user-wallets.service';
import { WalletTransactionsService } from '../../../payment/wallet-transactions/services/wallet-transactions.service';

@Injectable()
export class PropertyApprovalService {
  private readonly logger = new Logger(PropertyApprovalService.name);
  private readonly propertyRewardCashback: number = 200;

  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    @InjectRepository(PropertyApproval)
    private readonly approvalRepo: Repository<PropertyApproval>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly propertyIndexingService: PropertyIndexingService,
    private readonly notificationService: NotificationService,
    private readonly userWalletService: UserWalletsService,
    private readonly walletTransactionsService: WalletTransactionsService
  ) {}

  async list(page = 1, limit = 10, status?: string) {
    const [data, total] = await this.approvalRepo.findAndCount({
      where: status ? { status } : {},
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { property: true }
    });
    return { data, total, page, limit };
  }

  async get(id: string) {
    const row = await this.approvalRepo.findOne({
      where: { id },
      relations: { property: true }
    });
    if (!row) throw new NotFoundException('Approval not found');
    return row;
  }

  async getByPropertyId(propertyId: string) {
    const property = await this.propertyRepo.findOne({
      where: { id: propertyId }
    });
    if (!property) throw new NotFoundException('Property not found');

    const approvals = await this.approvalRepo.findOne({
      where: { property_id: propertyId },
      relations: { property: true },
      order: { created_at: 'DESC' }
    });

    return approvals;
  }

  async startReview(propertyId: string, reviewerId: string, comments?: string) {
    const property = await this.propertyRepo.findOne({
      where: { id: propertyId }
    });
    if (!property) throw new NotFoundException('Property not found');

    // Check if approval already exists
    const existing = await this.approvalRepo.findOne({
      where: { property_id: propertyId },
      order: { created_at: 'DESC' }
    });

    if (existing && existing.status === 'UNDER_REVIEW') {
      throw new BadRequestException('Property is already under review');
    }

    // Create new approval record
    const approval = this.approvalRepo.create({
      property_id: propertyId,
      status: 'UNDER_REVIEW',
      reviewer_id: reviewerId,
      comments
    });

    await this.approvalRepo.save(approval);
    await this.propertyRepo.update(propertyId, {
      approval_status: 'UNDER_REVIEW'
    });

    return this.approvalRepo.findOne({
      where: { id: approval.id },
      relations: { property: true }
    });
  }

  async approveProperty(
    propertyId: string,
    reviewerId: string,
    comments?: string
  ) {
    const property = await this.propertyRepo.findOne({
      where: { id: propertyId }
    });
    if (!property) throw new NotFoundException('Property not found');

    // Get or create approval record
    let approval = await this.approvalRepo.findOne({
      where: { property_id: propertyId },
      order: { created_at: 'DESC' }
    });

    if (!approval) {
      // Create approval record if it doesn't exist
      approval = this.approvalRepo.create({
        property_id: propertyId,
        status: 'APPROVED',
        reviewer_id: reviewerId,
        comments,
        resolved_at: new Date()
      });
      await this.approvalRepo.save(approval);
    } else {
      // Update existing approval
      await this.approvalRepo.update(approval.id, {
        status: 'APPROVED',
        comments,
        reviewer_id: reviewerId,
        resolved_at: new Date()
      });
    }

    await this.propertyRepo.update(propertyId, {
      approval_status: 'APPROVED',
      approved_at: new Date(),
      is_published: true,
      is_verified: true
    });

    await this.propertyIndexingService.updateProperty(propertyId);

    // Send property approved notification to owner
    if (property.owner_id) {
      const user = await this.userRepo.findOne({
        where: { id: property.owner_id }
      });
      if (!user) throw new NotFoundException('User not found');
      
      // Check the number of approved properties for this user (including this one)
      const approvedPropertiesCount = await this.propertyRepo.count({
        where: {
          owner_id: property.owner_id,
          approval_status: 'APPROVED'
        }
      });

      // If this is the 3rd approved property, add cashback
      if (approvedPropertiesCount === 3) {
        await this.addPropertyCashbackAmount(property);
      }

      try {
        const propertyUrl = `/properties/${propertyId}`;
        await this.notificationService.send({
          userId: property.owner_id,
          templateCode: 'PROPERTY_APPROVED',
          variables: {
            property_title: property.title,
            property_id: propertyId,
            property_url: propertyUrl,
            short_url: propertyUrl,
            user_name:
              `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`.trim() ||
              user.firstName ||
              'User',
            user_email: user.email,
            phoneNumber: user.phoneNumber
          },
          entityType: NotificationEntityType.PROPERTY,
          entityId: propertyId
        });
      } catch (error) {
        // Log error but don't break the flow
        console.error('Failed to send property approved notification', error);
      }
    }

    return this.approvalRepo.findOne({
      where: { id: approval.id },
      relations: { property: true }
    });
  }

  async rejectProperty(
    propertyId: string,
    reviewerId: string,
    rejection_reason: string,
    comments?: string
  ) {
    const property = await this.propertyRepo.findOne({
      where: { id: propertyId }
    });
    if (!property) throw new NotFoundException('Property not found');

    // Get or create approval record
    let approval = await this.approvalRepo.findOne({
      where: { property_id: propertyId },
      order: { created_at: 'DESC' }
    });

    if (!approval) {
      // Create approval record if it doesn't exist
      approval = this.approvalRepo.create({
        property_id: propertyId,
        status: 'REJECTED',
        reviewer_id: reviewerId,
        rejection_reason,
        comments,
        resolved_at: new Date()
      });
      await this.approvalRepo.save(approval);
    } else {
      // Update existing approval
      await this.approvalRepo.update(approval.id, {
        status: 'REJECTED',
        reviewer_id: reviewerId,
        rejection_reason,
        comments,
        resolved_at: new Date()
      });
    }

    await this.propertyRepo.update(propertyId, {
      approval_status: 'REJECTED',
      approved_at: new Date(),
      is_published: false
    });

    await this.propertyIndexingService.updateProperty(propertyId);

    return this.approvalRepo.findOne({
      where: { id: approval.id },
      relations: { property: true }
    });
  }

  async requestChangesForProperty(
    propertyId: string,
    reviewerId: string,
    required_changes: string,
    comments?: string
  ) {
    const property = await this.propertyRepo.findOne({
      where: { id: propertyId }
    });
    if (!property) throw new NotFoundException('Property not found');

    // Get or create approval record
    let approval = await this.approvalRepo.findOne({
      where: { property_id: propertyId },
      order: { created_at: 'DESC' }
    });

    if (!approval) {
      // Create approval record if it doesn't exist
      approval = this.approvalRepo.create({
        property_id: propertyId,
        status: 'UNDER_REVIEW',
        reviewer_id: reviewerId,
        requires_changes: true,
        required_changes,
        comments
      });
      await this.approvalRepo.save(approval);
    } else {
      // Update existing approval
      await this.approvalRepo.update(approval.id, {
        status: 'UNDER_REVIEW',
        reviewer_id: reviewerId,
        requires_changes: true,
        required_changes,
        comments
      });
    }

    await this.propertyRepo.update(propertyId, {
      approval_status: 'UNDER_REVIEW',
      is_published: false,
      is_verified: false
    });

    await this.propertyIndexingService.indexProperty(propertyId);

    // Send property needs update notification to owner
    if (property.owner_id) {
      try {
        const user = await this.userRepo.findOne({
          where: { id: property.owner_id }
        });
        if (!user) throw new NotFoundException('User not found');
        await this.notificationService.send({
          userId: property.owner_id,
          templateCode: 'PROPERTY_REJECTED',
          variables: {
            property_title: property.title,
            property_id: propertyId,
            rejection_reason: required_changes,
            user_name:
              `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`.trim() ||
              user.firstName ||
              'User',
            user_email: user.email,
            phoneNumber: user.phoneNumber
          },
          entityType: NotificationEntityType.PROPERTY,
          entityId: propertyId
        });
      } catch (error) {
        // Log error but don't break the flow
        console.error(
          'Failed to send property needs update notification',
          error
        );
      }
    }

    return this.approvalRepo.findOne({
      where: { id: approval.id },
      relations: { property: true }
    });
  }

  async stats() {
    const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW'];
    const items = await Promise.all(
      statuses.map(async (s) => ({
        status: s,
        count: await this.approvalRepo.count({ where: { status: s } })
      }))
    );
    return { items, total: items.reduce((a, b) => a + b.count, 0) };
  }

  private async addPropertyCashbackAmount(property: Property) {
    console.log('[Property Cashback] Starting cashback process for user:', property.owner_id);
    console.log('[Property Cashback] Property ID:', property.id);
    console.log('[Property Cashback] Cashback amount:', this.propertyRewardCashback);

    try {
      console.log('[Property Cashback] Step 1: Finding wallet for user:', property.owner_id);
      let wallet = await this.userWalletService.findOneByUserId(property.owner_id);
      console.log('[Property Cashback] Step 1 Result - Wallet found:', wallet ? 'YES' : 'NO');
      console.log('[Property Cashback] Step 1 Result - Wallet data:', JSON.stringify(wallet, null, 2));

      // Create wallet if it doesn't exist
      if (!wallet) {
        console.log('[Property Cashback] Step 2: Creating new wallet for user:', property.owner_id);
        await this.userWalletService.create({ user_id: property.owner_id });
        this.logger.log(`User wallet created for user ${property.owner_id}`);
        console.log('[Property Cashback] Step 2: Wallet created successfully');
        
        console.log('[Property Cashback] Step 3: Fetching newly created wallet');
        wallet = await this.userWalletService.findOneByUserId(property.owner_id);
        console.log('[Property Cashback] Step 3 Result - New wallet data:', JSON.stringify(wallet, null, 2));
      } else {
        console.log('[Property Cashback] Step 2: Wallet already exists, skipping creation');
      }

      // Log current balance before increment
      console.log('[Property Cashback] Step 4: Current wallet balance');
      console.log('[Property Cashback] Step 4 - Raw balance value:', wallet.balance);
      console.log('[Property Cashback] Step 4 - Balance type:', typeof wallet.balance);

      // Update wallet balance and get updated wallet (incrementBalance handles the addition)
      console.log('[Property Cashback] Step 5: Incrementing wallet balance');
      console.log('[Property Cashback] Step 5 - User ID:', property.owner_id);
      console.log('[Property Cashback] Step 5 - Amount to add:', this.propertyRewardCashback);
      
      const updatedWallet = await this.userWalletService.incrementBalance(
        property.owner_id,
        this.propertyRewardCashback
      );

      console.log('[Property Cashback] Step 5 Result - Increment completed');
      console.log('[Property Cashback] Step 5 Result - Updated wallet data:', JSON.stringify(updatedWallet, null, 2));
      console.log('[Property Cashback] Step 5 Result - Updated balance value:', updatedWallet.balance);
      console.log('[Property Cashback] Step 5 Result - Updated balance type:', typeof updatedWallet.balance);

      // Get the actual balance after increment (incrementBalance already did the calculation)
      console.log('[Property Cashback] Step 6: Getting final balance from updated wallet');
      const balanceAfter = Number(updatedWallet.balance) || 0;
      console.log('[Property Cashback] Step 6 Result - Balance after:', balanceAfter);

      // Create transaction record
      console.log('[Property Cashback] Step 7: Creating wallet transaction record');
      console.log('[Property Cashback] Step 7 - Transaction data:', {
        user_wallet_id: wallet.id,
        amount: this.propertyRewardCashback,
        balance_after: balanceAfter,
        source: 'PROPERTY_APPROVAL',
        reference_type: 'PROPERTY',
        reference_id: property.id,
        description: 'Property approval cashback - 3rd property approved'
      });

      const transaction = await this.walletTransactionsService.createCredit({
        user_wallet_id: wallet.id,
        amount: this.propertyRewardCashback,
        balance_after: balanceAfter,
        source: 'PROPERTY_APPROVAL',
        reference_type: 'PROPERTY',
        reference_id: property.id,
        description: 'Property approval cashback - 3rd property approved'
      });

      console.log('[Property Cashback] Step 7 Result - Transaction created:', JSON.stringify(transaction, null, 2));

      console.log('[Property Cashback] Step 8: Cashback process completed successfully');
      // Get previous balance for summary (from original wallet)
      const previousBalance = Number(wallet.balance) || 0;
      
      console.log('[Property Cashback] Final Summary:', {
        userId: property.owner_id,
        propertyId: property.id,
        cashbackAmount: this.propertyRewardCashback,
        previousBalance: previousBalance,
        newBalance: balanceAfter,
        transactionId: transaction?.id || 'N/A'
      });

      this.logger.log(
        `Property cashback ₹${this.propertyRewardCashback} credited to user ${property.owner_id}. New balance: ₹${balanceAfter}`
      );
    } catch (error) {
      console.error('[Property Cashback] ERROR - Failed to credit cashback');
      console.error('[Property Cashback] ERROR - User ID:', property.owner_id);
      console.error('[Property Cashback] ERROR - Property ID:', property.id);
      console.error('[Property Cashback] ERROR - Error details:', error);
      console.error('[Property Cashback] ERROR - Error stack:', error?.stack);
      
      this.logger.error(
        `Failed to credit property cashback for user ${property.owner_id}`,
        error
      );
    }
  }
}
