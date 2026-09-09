import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  UnauthorizedException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User } from '../../entities';
import { UpdateProfileDto } from '../dto';
import { UserType } from '../../enums/usertype';
import type { UploadedFile } from '../../../property/property-media/types/uploaded-file';
import { S3StorageService } from '../../../shared/storage/s3-storage.service';
import { UserWalletsService } from '../../../payment/user-wallets/services/user-wallets.service';
import { WalletTransactionsService } from '../../../payment/wallet-transactions/services/wallet-transactions.service';
import { UserListItemDto } from '../dto/user-list-item.dto';
import {
  UpdatePasswordDto,
  UpdatePasswordResponseDto
} from '../dto/change-password.dto';
import bcrypt from 'bcrypt';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly registrationReward: number = 100;
  private readonly FIRST_50_USERS_LIMIT: number = 50;
  private readonly refferralBonus:number = 0;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly s3StorageService: S3StorageService,
    private readonly userWalletService: UserWalletsService,
    private readonly walletTransactionsService: WalletTransactionsService
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email }
    });
  }

  async create(createUserData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    isActive: boolean;
  }): Promise<User> {
    const user = this.userRepository.create(createUserData);
    user.roles = [UserType.BUYER];
    user.referralCode = await this.generateUniqueReferralCode();

    const savedUser = await this.userRepository.save(user);
    console.log(savedUser);
    // Check if this is one of the first 50 users
    const totalUsersCount = await this.userRepository.count();
    if (totalUsersCount <= this.FIRST_50_USERS_LIMIT) {
      await this.addSignupCashbackAmount(savedUser);
    }

    return savedUser;
  }

  async findById(id: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { id }
    });
  }

  async getProfile(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto
  ): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateProfileDto.email && updateProfileDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateProfileDto.email }
      });
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }
    }

    // Check phone uniqueness if phone is being updated
    if (
      updateProfileDto.phoneNumber &&
      updateProfileDto.phoneNumber !== user.phoneNumber
    ) {
      const existingUser = await this.userRepository.findOne({
        where: { phoneNumber: updateProfileDto.phoneNumber }
      });
      if (existingUser) {
        throw new ConflictException('Phone number already exists');
      }
    }

    if (updateProfileDto.firstName !== undefined) {
      user.firstName = updateProfileDto.firstName;
    }
    if (updateProfileDto.lastName !== undefined) {
      user.lastName = updateProfileDto.lastName;
    }
    if (updateProfileDto.email !== undefined) {
      user.email = updateProfileDto.email;
    }
    if (updateProfileDto.phoneNumber !== undefined) {
      user.phoneNumber = updateProfileDto.phoneNumber;
    }

    await this.userRepository.save(user);

    const { password, ...updatedProfile } = user;
    return updatedProfile;
  }

  async getLoginHistory(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['loginHistory']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.loginHistory;
  }

  // Method needed by forgot-password service (alias for findById)
  async findOne(id: string): Promise<User | null> {
    return this.findById(id);
  }

  private buildPhoneLookupCandidates(phoneNumber: string): string[] {
    const trimmed = phoneNumber.trim();
    const candidates = new Set<string>([trimmed]);
    const digitsOnly = trimmed.replace(/\D/g, '');

    if (digitsOnly.length === 10) {
      candidates.add(digitsOnly);
      candidates.add(`+91${digitsOnly}`);
    } else if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
      candidates.add(`+${digitsOnly}`);
      candidates.add(digitsOnly.slice(2));
    } else if (trimmed.startsWith('+')) {
      candidates.add(digitsOnly);
      if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
        candidates.add(digitsOnly.slice(2));
      }
    }

    return [...candidates];
  }

  // Method to find user by phone number for mobile login
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const candidates = this.buildPhoneLookupCandidates(phoneNumber);

    for (const candidate of candidates) {
      const user = await this.userRepository.findOne({
        where: { phoneNumber: candidate }
      });
      if (user) {
        return user;
      }
    }

    return null;
  }

  // Method to find user by referral code
  async findByReferralCode(referralCode: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { referralCode }
    });
  }

  // Method to generate unique referral code
  async generateUniqueReferralCode(): Promise<string> {
    let referralCode: string = '';
    let isUnique = false;

    while (!isUnique) {
      referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const existingUser = await this.findByReferralCode(referralCode);
      if (!existingUser) {
        isUnique = true;
      }
    }

    return referralCode;
  }

  // Enhanced create method with referral support
  async createWithReferral(createUserData: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    isActive: boolean;
    referredByCode?: string;
  }): Promise<User> {
    const userData: Partial<User> & {
      firstName?: string;
      lastName?: string;
      isActive: boolean;
    } = {
      firstName: createUserData.firstName,
      lastName: createUserData.lastName,
      isActive: createUserData.isActive
    };

    if (createUserData.email) userData.email = createUserData.email;
    if (createUserData.phoneNumber)
      userData.phoneNumber = createUserData.phoneNumber;
    if (createUserData.password) userData.password = createUserData.password;

    // Generate unique referral code for new user
    userData['referralCode'] = await this.generateUniqueReferralCode();

    // If referred by someone, validate and set referredBy
    let referrer: User | null = null;
    const referralCodeUsed = createUserData.referredByCode; // Store before deletion
    if (createUserData.referredByCode) {
      referrer = await this.findByReferralCode(
        createUserData.referredByCode
      );
      if (referrer) {
        userData['referredBy'] = referrer.id;
      }
      // Remove temporary field reference in the payload
      delete (userData as any)['referredByCode'];
    }
    userData.roles = [UserType.BUYER];
    const user = this.userRepository.create(userData);
    
    // Save user first to get the ID
    const savedUser = await this.userRepository.save(user);
    
    // Check if this is one of the first 50 users (after saving to get the ID)
    const totalUsersCount = await this.userRepository.count();
    if (totalUsersCount <= this.FIRST_50_USERS_LIMIT) {
      await this.addSignupCashbackAmount(savedUser);
    }

    // Reward referrer if user was referred
    if (referrer && referralCodeUsed) {
      // Call referral reward asynchronously (don't block registration)
      this.addReferralRewardAmount(
        referrer.id,
        savedUser.id,
        referralCodeUsed
      ).catch(error => {
        this.logger.error(
          `Failed to process referral reward for referrer ${referrer.id}`,
          error
        );
      });
    }

    return savedUser;
  }

  // In profile.service.ts - Add only this:

  async getReferralInfo(
    userId: string,
    page: number = 1,
    limit: number = 10,
    sort: string = 'DESC',
    orderBy: string = 'createdAt'
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'referralCode', 'referredBy']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build order object
    const order: any = {};
    const validOrderBy = ['createdAt', 'firstName', 'lastName', 'email'];
    const validSort = ['ASC', 'DESC'];
    const orderByField = validOrderBy.includes(orderBy) ? orderBy : 'createdAt';
    const sortOrder = validSort.includes(sort.toUpperCase()) ? sort.toUpperCase() : 'DESC';
    order[orderByField] = sortOrder;

    // Get total count
    const totalReferrals = await this.userRepository.count({
      where: { referredBy: userId }
    });

    // Get paginated referrals with email and roles
    const referrals = await this.userRepository.find({
      where: { referredBy: userId },
      select: ['id', 'firstName', 'lastName', 'email', 'roles', 'createdAt'],
      order,
      skip,
      take: limit
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalReferrals / limit);

    return {
      referralCode: user.referralCode,
      totalReferrals,
      referrals,
      pagination: {
        page,
        limit,
        total: totalReferrals,
        totalPages
      }
    };
  }

  async getReferralAnalytics(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Today
    const todayCount = await this.userRepository.count({
      where: {
        referredBy: userId,
        createdAt: MoreThanOrEqual(startOfToday)
      }
    });

    // This week
    const weekCount = await this.userRepository.count({
      where: {
        referredBy: userId,
        createdAt: MoreThanOrEqual(startOfWeek)
      }
    });

    // This month
    const monthCount = await this.userRepository.count({
      where: {
        referredBy: userId,
        createdAt: MoreThanOrEqual(startOfMonth)
      }
    });

    // This year
    const yearCount = await this.userRepository.count({
      where: {
        referredBy: userId,
        createdAt: MoreThanOrEqual(startOfYear)
      }
    });

    // Total (all time)
    const totalCount = await this.userRepository.count({
      where: { referredBy: userId }
    });

    const rewardPerReferral = this.refferralBonus;

    return {
      today: {
        count: todayCount,
        amount: todayCount * rewardPerReferral
      },
      week: {
        count: weekCount,
        amount: weekCount * rewardPerReferral
      },
      month: {
        count: monthCount,
        amount: monthCount * rewardPerReferral
      },
      year: {
        count: yearCount,
        amount: yearCount * rewardPerReferral
      },
      total: {
        count: totalCount,
        amount: totalCount * rewardPerReferral
      }
    };
  }

  async uploadProfilePicture(
    userId: string,
    file: UploadedFile
  ): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate file type
    if (!file.mimetype?.match(/^image\/(jpeg|png|gif|jpg|webp)$/)) {
      throw new BadRequestException(
        'Invalid file type. Only images (jpeg, png, gif, webp) are allowed'
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size && file.size > maxSize) {
      throw new BadRequestException('File size exceeds the 5MB limit');
    }

    // Delete old profile picture if exists
    if (user.profilePictureKey) {
      try {
        await this.s3StorageService.delete({ key: user.profilePictureKey });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('Failed to delete old profile picture:', message);
      }
    }

    // Generate S3 key
    const key = `users/${userId}/profile-picture/${Date.now()}-${(file.originalname || 'profile').replace(/\s+/g, '_')}`;

    // Upload to S3
    const uploadResult = await this.s3StorageService.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
      acl: 'public-read',
      metadata: {
        userId,
        original_filename: file.originalname || '',
        type: 'profile-picture'
      }
    });

    // Update user with new profile picture
    user.profilePicture = uploadResult.url;
    user.profilePictureKey = key;

    await this.userRepository.save(user);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async deleteProfilePicture(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profilePictureKey) {
      throw new BadRequestException('No profile picture to delete');
    }

    // Delete from S3
    try {
      await this.s3StorageService.delete({ key: user.profilePictureKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Failed to delete profile picture from S3:', message);
    }

    // Clear profile picture fields
    user.profilePicture = '';
    user.profilePictureKey = '';

    await this.userRepository.save(user);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private async addSignupCashbackAmount(user: User) {
    console.log(
      '[Signup Cashback] Starting cashback process for user:',
      user.id
    );
    console.log('[Signup Cashback] User email:', user.email);
    console.log('[Signup Cashback] Cashback amount:', this.registrationReward);

    try {
      console.log(
        '[Signup Cashback] Step 1: Finding wallet for user:',
        user.id
      );
      let wallet = await this.userWalletService.findOneByUserId(user.id);
      console.log(
        '[Signup Cashback] Step 1 Result - Wallet found:',
        wallet ? 'YES' : 'NO'
      );
      console.log(
        '[Signup Cashback] Step 1 Result - Wallet data:',
        JSON.stringify(wallet, null, 2)
      );

      // Create wallet if it doesn't exist
      if (!wallet) {
        console.log(
          '[Signup Cashback] Step 2: Creating new wallet for user:',
          user.id
        );
        await this.userWalletService.create({ user_id: user.id });
        this.logger.log(`User wallet created for user ${user.id}`);
        console.log('[Signup Cashback] Step 2: Wallet created successfully');

        console.log('[Signup Cashback] Step 3: Fetching newly created wallet');
        wallet = await this.userWalletService.findOneByUserId(user.id);
        console.log(
          '[Signup Cashback] Step 3 Result - New wallet data:',
          JSON.stringify(wallet, null, 2)
        );
      } else {
        console.log(
          '[Signup Cashback] Step 2: Wallet already exists, skipping creation'
        );
      }

      // Log current balance before increment
      console.log('[Signup Cashback] Step 4: Current wallet balance');
      console.log(
        '[Signup Cashback] Step 4 - Raw balance value:',
        wallet.balance
      );
      console.log(
        '[Signup Cashback] Step 4 - Balance type:',
        typeof wallet.balance
      );

      // Update wallet balance and get updated wallet (incrementBalance handles the addition)
      console.log('[Signup Cashback] Step 5: Incrementing wallet balance');
      console.log('[Signup Cashback] Step 5 - User ID:', user.id);
      console.log(
        '[Signup Cashback] Step 5 - Amount to add:',
        this.registrationReward
      );

      const updatedWallet = await this.userWalletService.incrementBalance(
        user.id,
        this.registrationReward
      );

      console.log('[Signup Cashback] Step 5 Result - Increment completed');
      console.log(
        '[Signup Cashback] Step 5 Result - Updated wallet data:',
        JSON.stringify(updatedWallet, null, 2)
      );
      console.log(
        '[Signup Cashback] Step 5 Result - Updated balance value:',
        updatedWallet.balance
      );
      console.log(
        '[Signup Cashback] Step 5 Result - Updated balance type:',
        typeof updatedWallet.balance
      );

      // Get the actual balance after increment (incrementBalance already did the calculation)
      console.log(
        '[Signup Cashback] Step 6: Getting final balance from updated wallet'
      );
      const balanceAfter = Number(updatedWallet.balance) || 0;
      console.log(
        '[Signup Cashback] Step 6 Result - Balance after:',
        balanceAfter
      );

      // Create transaction record
      console.log(
        '[Signup Cashback] Step 7: Creating wallet transaction record'
      );
      console.log('[Signup Cashback] Step 7 - Transaction data:', {
        user_wallet_id: wallet.id,
        amount: this.registrationReward,
        balance_after: balanceAfter,
        source: 'SIGNUP_BONUS',
        reference_type: 'USER',
        reference_id: user.id,
        description: 'Signup bonus - First 50 users reward'
      });

      const transaction = await this.walletTransactionsService.createCredit({
        user_wallet_id: wallet.id,
        amount: this.registrationReward,
        balance_after: balanceAfter,
        source: 'SIGNUP_BONUS',
        reference_type: 'USER',
        reference_id: user.id,
        description: 'Signup bonus - First 50 users reward'
      });

      console.log(
        '[Signup Cashback] Step 7 Result - Transaction created:',
        JSON.stringify(transaction, null, 2)
      );

      console.log(
        '[Signup Cashback] Step 8: Cashback process completed successfully'
      );
      // Get previous balance for summary (from original wallet)
      const previousBalance = Number(wallet.balance) || 0;

      console.log('[Signup Cashback] Final Summary:', {
        userId: user.id,
        userEmail: user.email,
        cashbackAmount: this.registrationReward,
        previousBalance: previousBalance,
        newBalance: balanceAfter,
        transactionId: transaction?.id || 'N/A'
      });

      this.logger.log(
        `Signup cashback ₹${this.registrationReward} credited to user ${user.id}. New balance: ₹${balanceAfter}`
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Signup Cashback] ERROR - Failed to credit cashback');
      console.error('[Signup Cashback] ERROR - User ID:', user.id);
      console.error('[Signup Cashback] ERROR - User email:', user.email);
      console.error('[Signup Cashback] ERROR - Error details:', err);
      console.error('[Signup Cashback] ERROR - Error stack:', err.stack);

      this.logger.error(
        `Failed to credit signup cashback for user ${user.id}`,
        err
      );
    }
  }

  private async addReferralRewardAmount(
    referrerUserId: string,
    referredUserId: string,
    referralCode: string
  ) {
    console.log(
      '[Referral Reward] Starting referral reward process for referrer:',
      referrerUserId
    );
    console.log('[Referral Reward] Referred user ID:', referredUserId);
    console.log('[Referral Reward] Referral code used:', referralCode);
    console.log('[Referral Reward] Reward amount:', this.refferralBonus);

    try {
      // Find referrer user
      console.log(
        '[Referral Reward] Step 1: Finding referrer user:',
        referrerUserId
      );
      const referrer = await this.userRepository.findOne({
        where: { id: referrerUserId }
      });

      if (!referrer) {
        console.error('[Referral Reward] ERROR - Referrer user not found');
        this.logger.error(`Referrer user ${referrerUserId} not found`);
        return;
      }

      console.log('[Referral Reward] Step 1 Result - Referrer found:', referrer.email);

      // Find wallet for referrer
      console.log(
        '[Referral Reward] Step 2: Finding wallet for referrer:',
        referrerUserId
      );
      let wallet = await this.userWalletService.findOneByUserId(referrerUserId);
      console.log(
        '[Referral Reward] Step 2 Result - Wallet found:',
        wallet ? 'YES' : 'NO'
      );

      // Create wallet if it doesn't exist
      if (!wallet) {
        console.log(
          '[Referral Reward] Step 3: Creating new wallet for referrer:',
          referrerUserId
        );
        await this.userWalletService.create({ user_id: referrerUserId });
        this.logger.log(`User wallet created for referrer ${referrerUserId}`);
        console.log('[Referral Reward] Step 3: Wallet created successfully');

        wallet = await this.userWalletService.findOneByUserId(referrerUserId);
        console.log(
          '[Referral Reward] Step 3 Result - New wallet data:',
          JSON.stringify(wallet, null, 2)
        );
      } else {
        console.log(
          '[Referral Reward] Step 3: Wallet already exists, skipping creation'
        );
      }

      // Log current balance before increment
      console.log('[Referral Reward] Step 4: Current wallet balance');
      const previousBalance = Number(wallet.balance) || 0;
      console.log('[Referral Reward] Step 4 - Current balance:', previousBalance);

      // Increment wallet balance
      console.log('[Referral Reward] Step 5: Incrementing wallet balance');
      console.log('[Referral Reward] Step 5 - Amount to add:', this.refferralBonus);

      const updatedWallet = await this.userWalletService.incrementBalance(
        referrerUserId,
        this.refferralBonus
      );

      console.log('[Referral Reward] Step 5 Result - Increment completed');
      const balanceAfter = Number(updatedWallet.balance) || 0;
      console.log('[Referral Reward] Step 5 Result - Updated balance:', balanceAfter);

      // Create transaction record
      console.log(
        '[Referral Reward] Step 6: Creating wallet transaction record'
      );
      console.log('[Referral Reward] Step 6 - Transaction data:', {
        user_wallet_id: wallet.id,
        amount: this.refferralBonus,
        balance_after: balanceAfter,
        source: 'REFERRAL_BONUS',
        reference_type: 'USER',
        reference_id: referredUserId,
        description: `Referral bonus - User referred with code ${referralCode}`
      });

      const transaction = await this.walletTransactionsService.createCredit({
        user_wallet_id: wallet.id,
        amount: this.refferralBonus,
        balance_after: balanceAfter,
        source: 'REFERRAL_BONUS',
        reference_type: 'USER',
        reference_id: referredUserId,
        description: `Referral bonus - User referred with code ${referralCode}`
      });

      console.log(
        '[Referral Reward] Step 6 Result - Transaction created:',
        JSON.stringify(transaction, null, 2)
      );

      console.log(
        '[Referral Reward] Step 7: Referral reward process completed successfully'
      );

      console.log('[Referral Reward] Final Summary:', {
        referrerUserId: referrerUserId,
        referrerEmail: referrer.email,
        referredUserId: referredUserId,
        referralCode: referralCode,
        rewardAmount: this.refferralBonus,
        previousBalance: previousBalance,
        newBalance: balanceAfter,
        transactionId: transaction?.id || 'N/A'
      });

      this.logger.log(
        `Referral reward ₹${this.refferralBonus} credited to referrer ${referrerUserId} for referring user ${referredUserId}. New balance: ₹${balanceAfter}`
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Referral Reward] ERROR - Failed to credit referral reward');
      console.error('[Referral Reward] ERROR - Referrer User ID:', referrerUserId);
      console.error('[Referral Reward] ERROR - Referred User ID:', referredUserId);
      console.error('[Referral Reward] ERROR - Error details:', err);
      console.error('[Referral Reward] ERROR - Error stack:', err.stack);

      this.logger.error(
        `Failed to credit referral reward for referrer ${referrerUserId}`,
        err
      );
    }
  }

  async findAll(
    activeOnly = true,
    page = 1,
    limit = 0,
    search?: string,
    role?: UserType
  ): Promise<{
    data: UserListItemDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (activeOnly) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: true });
    }

    if (role) {
      // Enum arrays need unnest + text compare; casting roles::text[] can throw at runtime
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM unnest(user.roles) AS role_item
          WHERE role_item::text = :role
        )`,
        { role: String(role) }
      );
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      queryBuilder.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.phoneNumber ILIKE :search)',
        { search: searchTerm }
      );
    }

    queryBuilder.orderBy('user.createdAt', 'DESC');

    const total = await queryBuilder.getCount();

    if (limit > 0) {
      queryBuilder.skip((page - 1) * limit).take(limit);
    }

    const users = await queryBuilder.getMany();

    const data: UserListItemDto[] = users.map((user) => this.toUserListItemDto(user));

    return {
      data,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total
    };
  }


  private toUserListItemDto(user: User): UserListItemDto {
    return {
      id: user.id,
      googleId: user.googleId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      isActive: user.isActive,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      roles: user.roles,
      isKycVerified: user.isKycVerified,
      kycVerifiedAt: user.kycVerifiedAt,
      aadhaarNumberMasked: user.aadhaarNumberMasked,
      profilePicture: user.profilePicture,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      hasPassword: !!user.password
    };
  }

  /**
   * OTP-verified forgot-password reset. Never requires currentPassword,
   * even when the user already has a password set.
   */
  async resetPasswordWithOtp(
    userId: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'isActive']
    });

    if (!user || !user.isActive) {
      throw new BadRequestException(
        'User not found or account is deactivated'
      );
    }

    if (user.password) {
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        throw new BadRequestException(
          'New password must be different from current password'
        );
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(userId, { password: hashedPassword });
    this.logger.log(`Password reset via OTP for user ${userId}`);
  }

  async updatePassword(
    userId: string,
    dto: UpdatePasswordDto
  ): Promise<UpdatePasswordResponseDto> {
    const { currentPassword, newPassword, confirmPassword } = dto;

    // Validate new passwords match
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('New password and confirm password do not match');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.password) {
      if (!currentPassword) {
        throw new BadRequestException('Current password is required');
      }

      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Check if new password is same as current
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        throw new BadRequestException('New password must be different from current password');
      }
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(userId, { password: hashedPassword });

    this.logger.log(`Password updated for user ${userId}`);

    return {
      success: true,
      message: 'Password updated successfully'
    } as UpdatePasswordResponseDto;
  }
}
