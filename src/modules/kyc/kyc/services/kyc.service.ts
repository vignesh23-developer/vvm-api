import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
  Inject,
  forwardRef
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { KycVerification } from '../../entities/kyc-verification.entity';
import { KycStatus, VerificationType, KycEntityType } from '../../enums';
import {
  InitiateKycDto,
  InitiateKycResponseDto,
  CompleteKycDto,
  CompleteKycResponseDto,
  KycStatusResponseDto,
  KycStatsResponseDto,
  MyKycStatusResponseDto,
  PaginatedKycResponseDto
} from '../dto';
import { User } from '../../../users';
import { S3StorageService } from '../../../shared/storage/s3-storage.service';
import { RazorpayService } from '../../../shared/services/payment/razorpay.service';
import { VerifyPaymentDto } from 'src/modules/subscription/user-subscription/dto/user-subscription.dto';
import { PaymentOrdersService } from 'src/modules/payment/payment-orders/services/payment-orders.service';
import { PaymentTransactionsService } from 'src/modules/payment/payment-transactions/services/payment-transactions.service';
import { UserWalletsService } from 'src/modules/payment/user-wallets/services/user-wallets.service';
import { UserSubscriptionService } from 'src/modules/subscription/user-subscription/services/user-subscription.service';
import {
  NotificationService,
} from '../../../notification/services/notification.service';
import { NotificationEntityType } from '../../../notification/enums/notification.enum';
import { WalletTransactionsService } from '../../../payment/wallet-transactions/services/wallet-transactions.service';

interface SurepassInitResponse {
  data: {
    client_id: string;
    token: string;
    url: string;
    expiry_seconds: number;
  };
  status_code: number;
  message_code: string;
  message: string;
  success: boolean;
}

interface SurepassDownloadResponse {
  data: {
    client_id: string;
    digilocker_metadata: {
      name: string;
      gender: string;
      dob: string;
      mobile_number: string;
    };
    aadhaar_xml_data: {
      full_name: string;
      care_of: string;
      dob: string;
      yob: string;
      zip: string;
      profile_image: string;
      gender: string;
      masked_aadhaar: string;
      full_address: string;
      father_name: string;
      address: {
        country: string;
        dist: string;
        state: string;
        po: string;
        house: string;
        loc: string;
        vtc: string;
        subdist: string;
        street: string;
        landmark: string;
      };
    };
    xml_url: string;
  };
  status_code: number;
  success: boolean;
  message: string;
  message_code: string;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  private readonly KYC_AMOUNT = 100;
  private readonly KYC_CASHBACK_AMOUNT = 100;

  constructor(
    @InjectRepository(KycVerification)
    private readonly kycRepo: Repository<KycVerification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly s3Service: S3StorageService,
    private readonly razorpayService: RazorpayService,
    private readonly paymentOrderService: PaymentOrdersService,
    private readonly transactionsService: PaymentTransactionsService,
    private readonly userWalletService: UserWalletsService,
    private readonly walletTransactionsService: WalletTransactionsService,
    @Inject(forwardRef(() => UserSubscriptionService))
    private readonly userSubscriptionService: UserSubscriptionService,
    private readonly notificationService: NotificationService
  ) {
    this.apiKey = this.config.getOrThrow<string>('SUREPASS_API_KEY');
    this.baseUrl = this.config.get<string>(
      'SUREPASS_BASE_URL',
      'https://kyc-api.surepass.app/api/v1'
    );
  }

  /**
   * Step 0.1: Initiate KYC Order
   * Creates a payment order and transaction for the KYC order
   */
  async initiateKycOrder(
    userId: string,
    redirectUrl: string,
    system?: { ipAddress?: string; userAgent?: string }
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ipAddress = system?.ipAddress || null;
    const userAgent = system?.userAgent || null;

    const userWallet = await this.userWalletService.findOneByUserId(userId);
    if (!userWallet) {
      await this.userWalletService.create({ user_id: userId });
      this.logger.log(`User wallet created for user ${userId}`);
    } else {
      this.logger.log(`User wallet already exists for user ${userId}`);
    }

    const kycRazorpayOrder = await this.razorpayService.createOrder(
      this.KYC_AMOUNT * 100,
      'INR',
      `KYC_${userId}`,
      {
        user_id: userId,
        purpose: 'KYC',
        related_entity_type: 'KYC',
        related_entity_id: userId,
        redirect_url: redirectUrl,
        ip_address: ipAddress,
        user_agent: userAgent,
        user_wallet_id: userWallet.id
      }
    );

    await this.paymentOrderService.createFromRazorpayOrder(kycRazorpayOrder, {
      user_id: userId,
      gateway_order_id: kycRazorpayOrder.id,
      channel: 'WEB',
      purpose: 'KYC',
      related_entity_type: KycEntityType.USER,
      related_entity_id: userId,
      base_amount: this.KYC_AMOUNT * 100,
      tax_percent: 0,
      tax_amount: 0,
      subtotal: this.KYC_AMOUNT * 100,
      payable_amount: this.KYC_AMOUNT * 100,
      notes: {
        type: 'KYC',
        user_id: userId,
        related_entity_type: KycEntityType.USER,
        related_entity_id: userId,
        redirect_url: redirectUrl,
        ip_address: ipAddress,
        user_agent: userAgent,
        user_wallet_id: userWallet.id
      }
    });

    return kycRazorpayOrder;
  }

  /**
   * Step 0.1: Verify KYC Order
   * Create Transactions Record for KYC and initiates the kyc verification
   */

  async verifyKycOrder(dto: VerifyPaymentDto) {
    const isValid = await this.razorpayService.verifySignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature
    );
    if (!isValid) throw new UnauthorizedException('Invalid payment signature');

    const order = await this.razorpayService.getOrderById(
      dto.razorpay_order_id
    );
    // Step 2: Find payment order by gateway order ID
    const paymentOrder = await this.paymentOrderService.findByGatewayOrderId(
      dto.razorpay_order_id
    );

    if (!paymentOrder) {
      throw new NotFoundException('Payment order not found');
    }

    await this.transactionsService.create({
      payment_order_id: paymentOrder.id,
      gateway_payment_id: dto.razorpay_payment_id,
      gateway_signature: dto.razorpay_signature,
      amount: Number(order.amount),
      currency: 'INR',
      status: 'CAPTURED',
      method: order.method,
      attempt_number: 1,
      gateway_response: order,
      verified_at: new Date()
    });

    const userKYC = this.initiateKyc(
      order.notes?.user_id as string,
      {
        verificationType: VerificationType.AADHAAR,
        entityType: KycEntityType.USER,
        redirectUrl: order.notes?.redirect_url as string
      },
      order.notes?.ip_address as string,
      order.notes?.user_agent as string
    );

    return userKYC;
  }

  async initiateKyc(
    userId: string,
    dto: InitiateKycDto,
    ipAddress?: string,
    userAgent?: string,
    directCall: boolean = false
  ): Promise<InitiateKycResponseDto> {
    void directCall;
    // KYC is free: subscription / paid-KYC gate disabled (was directCall-only).
    // if (directCall) {
    //   const hasActiveSubscription = !!(
    //     await this.userSubscriptionService.getActive(userId)
    //   )?.data;

    //   const hasPendingPaidKyc = await this.kycRepo.findOne({
    //     where: {
    //       userId,
    //       status: KycStatus.PENDING
    //     }
    //   });

    //   if (!hasActiveSubscription && !hasPendingPaidKyc) {
    //     throw new NotFoundException(
    //       'No active subscription or paid KYC attempt found. Please subscribe or pay ₹100 to continue.'
    //     );
    //   }
    // }

    const verificationType = dto.verificationType || VerificationType.AADHAAR;
    const entityType = dto.entityType || KycEntityType.USER;
    const entityId = entityType === KycEntityType.USER ? userId : dto.companyId;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      entityType === KycEntityType.USER &&
      verificationType === VerificationType.AADHAAR &&
      user.isKycVerified
    ) {
      throw new ConflictException('Aadhaar verification already completed');
    }

    const pendingKyc = await this.kycRepo.findOne({
      where: {
        entityType,
        entityId,
        verificationType,
        status: KycStatus.PENDING
      },
      order: { createdAt: 'DESC' }
    });

    // If there's a valid pending KYC with verificationUrl, return it
    if (
      pendingKyc &&
      pendingKyc.verificationUrl &&
      pendingKyc.expiresAt &&
      pendingKyc.expiresAt > new Date()
    ) {
      return {
        success: true,
        verificationId: pendingKyc.id,
        verificationUrl: pendingKyc.verificationUrl,
        expiresInSeconds: Math.floor(
          (pendingKyc.expiresAt.getTime() - Date.now()) / 1000
        ),
        message:
          'Verification already in progress. Please complete the existing verification.'
      };
    }

    // If there's an expired pending KYC, mark it as expired
    if (
      pendingKyc &&
      pendingKyc.expiresAt &&
      pendingKyc.expiresAt <= new Date()
    ) {
      pendingKyc.status = KycStatus.EXPIRED;
      await this.kycRepo.save(pendingKyc);
    }

    // Use existing PENDING KYC if it exists (e.g., from failed Surepass), otherwise create new one
    let kyc: KycVerification;
    let isNewKyc = false;

    if (pendingKyc && !pendingKyc.verificationUrl) {
      // Retry Surepass on existing PENDING KYC without verificationUrl
      kyc = pendingKyc;
      kyc.redirectUrl = dto.redirectUrl;
      if (ipAddress) kyc.ipAddress = ipAddress;
      if (userAgent) kyc.userAgent = userAgent;
      this.logger.log(`Retrying Surepass for existing KYC record: ${kyc.id}`);
    } else {
      // Create new KYC record with PENDING status before Surepass call
      isNewKyc = true;
      kyc = this.kycRepo.create({
        entityType,
        entityId,
        userId: user.id,
        verificationType,
        status: KycStatus.PENDING,
        redirectUrl: dto.redirectUrl,
        ipAddress,
        userAgent
      } as unknown as KycVerification);

      await this.kycRepo.save(kyc);

      // Add cashback immediately after creating new KYC record (only for new records)
      if (entityType === KycEntityType.USER && kyc.userId) {
        await this.addKYCCashbackAmount(kyc);
      }
    }

    // Attempt Surepass initialization
    const providerResponse = await this.callSurepassInitialize(
      dto.redirectUrl || ''
    );

    if (providerResponse.success && providerResponse.data) {
      // Update KYC record with Surepass data
      const { data } = providerResponse;
      const expiresAt = new Date(Date.now() + data.expiry_seconds * 1000);

      kyc.surepassClientId = data.client_id;
      kyc.surepassToken = data.token;
      kyc.verificationUrl = data.url;
      kyc.expiresAt = expiresAt;
      kyc.rawInitResponse = providerResponse;

      await this.kycRepo.save(kyc);

      this.logger.log(
        `KYC initiated: ${verificationType} for ${entityType}:${entityId}, clientId: ${data.client_id}`
      );

      return {
        success: true,
        verificationId: kyc.id,
        verificationUrl: data.url,
        expiresInSeconds: data.expiry_seconds,
        message: `Please complete verification within ${Math.floor(data.expiry_seconds / 60)} minutes`
      };
    } else {
      // Surepass failed, but KYC record exists with PENDING status
      kyc.rawInitResponse = providerResponse;
      await this.kycRepo.save(kyc);

      this.logger.warn(
        `KYC created but Surepass init failed: ${verificationType} for ${entityType}:${entityId}, error: ${providerResponse.message || 'Unknown error'}`
      );

      return {
        success: true,
        verificationId: kyc.id,
        verificationUrl: '',
        expiresInSeconds: 0,
        message:
          providerResponse.message ||
          'KYC record created but verification initialization failed. Please try again later.'
      };
    }
  }

  async completeKyc(
    userId: string,
    dto: CompleteKycDto
  ): Promise<CompleteKycResponseDto> {
    // Find the verification record
    const kyc = await this.kycRepo.findOne({
      where: {
        userId,
        surepassClientId: dto.clientId
      }
    });

    if (!kyc) {
      throw new NotFoundException(
        'Verification not found or client ID mismatch'
      );
    }

    if (kyc.status === KycStatus.VERIFIED) {
      return {
        success: true,
        message: 'Verification already completed',
        verificationId: kyc.id,
        maskedAadhaar: kyc.documentNumberMasked,
        verifiedName: kyc.verifiedName
      };
    }

    if (kyc.status !== KycStatus.PENDING) {
      throw new BadRequestException(
        `Verification cannot be completed. Current status: ${kyc.status}`
      );
    }

    if (kyc.expiresAt < new Date()) {
      kyc.status = KycStatus.EXPIRED;
      await this.kycRepo.save(kyc);
      throw new BadRequestException(
        'Verification has expired. Please initiate a new verification.'
      );
    }

    const downloadResponse = await this.callSurepassDownloadAadhaar(
      dto.clientId
    );

    if (!downloadResponse.success) {
      await this.handleVerificationFailed(
        kyc,
        downloadResponse.message_code || 'DOWNLOAD_FAILED',
        downloadResponse.message || 'Failed to download Aadhaar details',
        downloadResponse
      );
      throw new BadRequestException(
        downloadResponse.message || 'Failed to download Aadhaar details'
      );
    }

    await this.handleVerificationSuccess(kyc, downloadResponse);

    if (kyc.userId) {
      try {
        const user = await this.userRepo.findOne({
          where: { id: kyc.userId },
          select: ['id', 'firstName', 'lastName']
        });

        if (user) {
          const user_name =
            `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`.trim() ||
            user.firstName ||
            'User';

          await this.notificationService.send({
            userId: kyc.userId,
            templateCode: 'KYC_APPROVED',
            variables: {
              user_name,
              user_email: user.email,
              phoneNumber: user.phoneNumber
            },
            entityType: NotificationEntityType.KYC,
            entityId: kyc.id
          });

          this.logger.log(
            `KYC approved notification sent to user ${kyc.userId}`
          );
        }
      } catch (error) {
        this.logger.error('Failed to send KYC approved notification', error);
        // Don't throw - notification failure shouldn't break KYC completion
      }
    }

    return {
      success: true,
      message: 'KYC verification completed successfully',
      verificationId: kyc.id,
      maskedAadhaar: kyc.documentNumberMasked,
      verifiedName: kyc.verifiedName
    };
  }

  async getMyKycStatus(userId: string): Promise<MyKycStatusResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const latestKyc = await this.kycRepo.findOne({
      where: { userId, entityType: KycEntityType.USER },
      order: { createdAt: 'DESC' }
    });

    return {
      isVerified: user.isKycVerified || false,
      verifiedAt: user.kycVerifiedAt,
      aadhaarMasked: user.aadhaarNumberMasked,
      latestAttempt: latestKyc ? this.toResponseDto(latestKyc) : undefined
    };
  }

  async getVerificationById(
    id: string,
    userId: string
  ): Promise<KycStatusResponseDto> {
    const kyc = await this.kycRepo.findOne({
      where: { id, userId }
    });

    if (!kyc) {
      throw new NotFoundException('Verification not found');
    }

    return this.toResponseDto(kyc);
  }

  async getMyVerifications(userId: string): Promise<KycStatusResponseDto[]> {
    const verifications = await this.kycRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' }
    });

    return verifications.map((v) => this.toResponseDto(v));
  }

  async getKycStats(): Promise<KycStatsResponseDto> {
    const [total, verified, pending, failed, expired] = await Promise.all([
      this.kycRepo.count(),
      this.kycRepo.count({ where: { status: KycStatus.VERIFIED } }),
      this.kycRepo.count({ where: { status: KycStatus.PENDING } }),
      this.kycRepo.count({ where: { status: KycStatus.FAILED } }),
      this.kycRepo.count({ where: { status: KycStatus.EXPIRED } })
    ]);

    // Get breakdown by verification type
    const byTypeRaw = await this.kycRepo
      .createQueryBuilder('kyc')
      .select('kyc.verificationType', 'type')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN kyc.status = '${KycStatus.VERIFIED}' THEN 1 ELSE 0 END)`,
        'verified'
      )
      .groupBy('kyc.verificationType')
      .getRawMany();

    const byType: Record<string, { total: number; verified: number }> = {};
    byTypeRaw.forEach((row) => {
      byType[row.type] = {
        total: parseInt(row.total, 10),
        verified: parseInt(row.verified, 10)
      };
    });

    return { total, verified, pending, failed, expired, byType };
  }

  async getAllVerifications(
    filters: {
      status?: KycStatus;
      verificationType?: VerificationType;
      entityType?: KycEntityType;
    },
    page = 1,
    limit = 20
  ): Promise<PaginatedKycResponseDto> {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.verificationType)
      where.verificationType = filters.verificationType;
    if (filters.entityType) where.entityType = filters.entityType;

    const [data, total] = await this.kycRepo.findAndCount({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit
    });

    return {
      data: data.map((v) => this.toResponseDto(v)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getVerificationByIdAdmin(id: string): Promise<KycVerification> {
    const kyc = await this.kycRepo.findOne({
      where: { id },
      relations: ['user']
    });

    if (!kyc) {
      throw new NotFoundException('Verification not found');
    }

    return kyc;
  }

  async expireOldVerifications(): Promise<number> {
    const result = await this.kycRepo.update(
      {
        status: KycStatus.PENDING,
        expiresAt: LessThan(new Date())
      },
      { status: KycStatus.EXPIRED }
    );

    if (result?.affected && result?.affected > 0) {
      this.logger.log(`Expired ${result.affected} pending verifications`);
    }

    return result.affected || 0;
  }

  async testKycNotification(user: User) {
    const userData = await this.userRepo.findOne({ where: { id: user.id } });
    if (!userData) {
      throw new NotFoundException('User not found');
    }
    return this.notificationService.send({
      userId: user.id,
      templateCode: 'KYC_APPROVED',
      variables: {
        user_name: userData.firstName + ' ' + userData.lastName,
        user_email: userData.email,
        phoneNumber: userData.phoneNumber
      },
      entityType: NotificationEntityType.KYC,
      entityId: 'b8cf8013-36e9-4d85-a31b-10090ad6438a'
    });
  }

  private async callSurepassInitialize(
    redirectUrl: string
  ): Promise<SurepassInitResponse> {
    try {
      const response = await axios.post<SurepassInitResponse>(
        `${this.baseUrl}/digilocker/initialize`,
        {
          data: {
            signup_flow: true,
            redirect_url: redirectUrl
          }
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      this.logger.error(
        'Surepass initialize failed',
        axiosError.response?.data || axiosError.message
      );

      return {
        success: false,
        status_code: axiosError.response?.status || 500,
        message_code: 'API_ERROR',
        message: axiosError.response?.data?.message || axiosError.message,
        data: null as any
      };
    }
  }

  private async callSurepassDownloadAadhaar(
    clientId: string
  ): Promise<SurepassDownloadResponse> {
    try {
      const response = await axios.get<SurepassDownloadResponse>(
        `${this.baseUrl}/digilocker/download-aadhaar/${clientId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`
          },
          timeout: 60000 // Longer timeout for download
        }
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      this.logger.error(
        'Surepass download aadhaar failed',
        axiosError.response?.data || axiosError.message
      );

      return {
        success: false,
        status_code: axiosError.response?.status || 500,
        message_code: axiosError.response?.data?.message_code || 'API_ERROR',
        message: axiosError.response?.data?.message || axiosError.message,
        data: null as any
      };
    }
  }

  private async handleVerificationSuccess(
    kyc: KycVerification,
    response: SurepassDownloadResponse
  ): Promise<void> {
    const { data } = response;
    const aadhaarData = data.aadhaar_xml_data;

    // Store XML document to S3
    let xmlUrl: string | undefined;
    let xmlKey: string | undefined;

    if (data.xml_url) {
      try {
        // Download XML from Surepass URL
        const xmlResponse = await axios.get(data.xml_url, {
          responseType: 'arraybuffer',
          timeout: 30000
        });

        // Generate unique key for S3
        xmlKey = `kyc/aadhaar/${kyc.userId}/${kyc.id}.xml`;

        // Upload to S3
        const s3Result = await this.s3Service.upload({
          key: xmlKey,
          body: Buffer.from(xmlResponse.data),
          contentType: 'application/xml',
          acl: 'private', // Keep Aadhaar XML private
          metadata: {
            verificationId: kyc.id,
            userId: kyc.userId || '',
            maskedAadhaar: aadhaarData.masked_aadhaar
          }
        });

        xmlUrl = s3Result.url;
        this.logger.log(`Aadhaar XML stored: ${xmlKey}`);
      } catch (error) {
        this.logger.error('Failed to store Aadhaar XML to S3', error);
        // Continue with verification even if S3 upload fails
      }
    }

    // Update verification record
    kyc.status = KycStatus.VERIFIED;
    kyc.documentNumberMasked = aadhaarData.masked_aadhaar;
    kyc.verifiedName = aadhaarData.full_name;
    kyc.verifiedData = {
      dob: aadhaarData.dob,
      gender: aadhaarData.gender,
      address: aadhaarData.full_address,
      addressDetails: aadhaarData.address,
      fatherName: aadhaarData.father_name,
      careOf: aadhaarData.care_of,
      // Don't store profile image in DB, keep only reference
      hasProfileImage: !!aadhaarData.profile_image,
      digilockerMetadata: data.digilocker_metadata
    };
    if (xmlUrl) kyc.xmlDocumentUrl = xmlUrl;
    if (xmlKey) kyc.xmlDocumentKey = xmlKey;
    kyc.rawDownloadResponse = response;
    kyc.completedAt = new Date();

    await this.kycRepo.save(kyc);

    // Update user if this is a USER entity type
    if (kyc.entityType === KycEntityType.USER && kyc.userId) {
      await this.userRepo.update(kyc.userId, {
        isKycVerified: true,
        kycVerifiedAt: new Date(),
        aadhaarNumberMasked: aadhaarData.masked_aadhaar
      });
    }

    this.logger.log(
      `KYC VERIFIED: ${kyc.verificationType} for ${kyc.entityType}:${kyc.entityId}`
    );
  }

  private async addKYCCashbackAmount(kyc: KycVerification) {
    console.log('[KYC Cashback] Starting cashback process for user:', kyc.userId);
    console.log('[KYC Cashback] KYC ID:', kyc.id);
    console.log('[KYC Cashback] Cashback amount:', this.KYC_CASHBACK_AMOUNT);

    try {
      console.log('[KYC Cashback] Step 1: Finding wallet for user:', kyc.userId);
      let wallet = await this.userWalletService.findOneByUserId(kyc.userId);
      console.log('[KYC Cashback] Step 1 Result - Wallet found:', wallet ? 'YES' : 'NO');
      console.log('[KYC Cashback] Step 1 Result - Wallet data:', JSON.stringify(wallet, null, 2));

      // Create wallet if it doesn't exist
      if (!wallet) {
        console.log('[KYC Cashback] Step 2: Creating new wallet for user:', kyc.userId);
        await this.userWalletService.create({ user_id: kyc.userId });
        this.logger.log(`User wallet created for user ${kyc.userId}`);
        console.log('[KYC Cashback] Step 2: Wallet created successfully');
        
        console.log('[KYC Cashback] Step 3: Fetching newly created wallet');
        wallet = await this.userWalletService.findOneByUserId(kyc.userId);
        console.log('[KYC Cashback] Step 3 Result - New wallet data:', JSON.stringify(wallet, null, 2));
      } else {
        console.log('[KYC Cashback] Step 2: Wallet already exists, skipping creation');
      }

      // Log current balance before increment
      console.log('[KYC Cashback] Step 4: Current wallet balance');
      console.log('[KYC Cashback] Step 4 - Raw balance value:', wallet.balance);
      console.log('[KYC Cashback] Step 4 - Balance type:', typeof wallet.balance);

      // Update wallet balance and get updated wallet (incrementBalance handles the addition)
      console.log('[KYC Cashback] Step 5: Incrementing wallet balance');
      console.log('[KYC Cashback] Step 5 - User ID:', kyc.userId);
      console.log('[KYC Cashback] Step 5 - Amount to add:', this.KYC_CASHBACK_AMOUNT);
      
      const updatedWallet = await this.userWalletService.incrementBalance(
        kyc.userId,
        this.KYC_CASHBACK_AMOUNT
      );

      console.log('[KYC Cashback] Step 5 Result - Increment completed');
      console.log('[KYC Cashback] Step 5 Result - Updated wallet data:', JSON.stringify(updatedWallet, null, 2));
      console.log('[KYC Cashback] Step 5 Result - Updated balance value:', updatedWallet.balance);
      console.log('[KYC Cashback] Step 5 Result - Updated balance type:', typeof updatedWallet.balance);

      // Get the actual balance after increment (incrementBalance already did the calculation)
      console.log('[KYC Cashback] Step 6: Getting final balance from updated wallet');
      const balanceAfter = Number(updatedWallet.balance) || 0;
      console.log('[KYC Cashback] Step 6 Result - Balance after:', balanceAfter);

      // Create transaction record
      console.log('[KYC Cashback] Step 7: Creating wallet transaction record');
      console.log('[KYC Cashback] Step 7 - Transaction data:', {
        user_wallet_id: wallet.id,
        amount: this.KYC_CASHBACK_AMOUNT,
        balance_after: balanceAfter,
        source: 'AADHAAR_VERIFICATION',
        reference_type: 'KYC_VERIFICATION',
        reference_id: kyc.id,
        description: 'Paid for KYC verification and added this to cashback'
      });

      const transaction = await this.walletTransactionsService.createCredit({
        user_wallet_id: wallet.id,
        amount: this.KYC_CASHBACK_AMOUNT,
        balance_after: balanceAfter,
        source: 'AADHAAR_VERIFICATION',
        reference_type: 'KYC_VERIFICATION',
        reference_id: kyc.id,
        description: 'Paid for KYC verification and added this to cashback'
      });

      console.log('[KYC Cashback] Step 7 Result - Transaction created:', JSON.stringify(transaction, null, 2));

      console.log('[KYC Cashback] Step 8: Cashback process completed successfully');
      // Get previous balance for summary (from original wallet)
      const previousBalance = Number(wallet.balance) || 0;
      
      console.log('[KYC Cashback] Final Summary:', {
        userId: kyc.userId,
        kycId: kyc.id,
        cashbackAmount: this.KYC_CASHBACK_AMOUNT,
        previousBalance: previousBalance,
        newBalance: balanceAfter,
        transactionId: transaction?.id || 'N/A'
      });

      this.logger.log(
        `KYC cashback ₹${this.KYC_CASHBACK_AMOUNT} credited to user ${kyc.userId}. New balance: ₹${balanceAfter}`
      );
    } catch (error) {
      console.error('[KYC Cashback] ERROR - Failed to credit cashback');
      console.error('[KYC Cashback] ERROR - User ID:', kyc.userId);
      console.error('[KYC Cashback] ERROR - KYC ID:', kyc.id);
      console.error('[KYC Cashback] ERROR - Error details:', error);
      console.error('[KYC Cashback] ERROR - Error stack:', error?.stack);
      
      this.logger.error(
        `Failed to credit KYC cashback for user ${kyc.userId}`,
        error
      );
    }
  }

  private async handleVerificationFailed(
    kyc: KycVerification,
    errorCode: string,
    errorMessage: string,
    rawResponse: any
  ): Promise<void> {
    kyc.status = KycStatus.FAILED;
    kyc.errorCode = errorCode;
    kyc.errorMessage = errorMessage;
    kyc.rawDownloadResponse = rawResponse;
    kyc.completedAt = new Date();

    await this.kycRepo.save(kyc);

    this.logger.warn(
      `KYC FAILED: ${kyc.verificationType} for ${kyc.entityType}:${kyc.entityId} - ${errorMessage}`
    );
  }

  private toResponseDto(kyc: KycVerification): KycStatusResponseDto {
    return {
      id: kyc.id,
      entityType: kyc.entityType,
      verificationType: kyc.verificationType,
      status: kyc.status,
      documentNumberMasked: kyc.documentNumberMasked,
      verifiedName: kyc.verifiedName,
      verifiedData: kyc.verifiedData,
      errorMessage: kyc.errorMessage,
      createdAt: kyc.createdAt,
      completedAt: kyc.completedAt
    };
  }
}
