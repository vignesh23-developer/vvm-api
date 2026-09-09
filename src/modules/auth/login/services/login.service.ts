import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { LoginHistory } from '../../entities/login-history.entity';
import { BusinessException } from '../../../../common';
import { ProfileService, RolesService, User } from '../../../users';
import {
  OtpPurpose,
  OtpService,
  OtpType,
  JwtAuthService,
  DeviceType,
  DeviceSessionService
} from '../../../shared';
import { LoginRequestDto, LoginResponseDto, VerifyOtpDto } from '../dto';
import { AgentCompanyProfileService } from '../../../users/company-profile/service/agent-company-profile.service';
import { UserInfoDto } from '../dto/user-info.dto';
import { UserType } from '../../../users/enums/usertype';
import { GoogleOAuthService } from '../../services/google-oauth.service';
import { DeviceInfoDto } from '../dto/device-info.dto';

@Injectable()
export class LoginService {
  constructor(
    @InjectRepository(LoginHistory)
    private loginHistoryRepository: Repository<LoginHistory>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private roleService: RolesService,
    private usersService: ProfileService,
    private agentCompanyProfileService: AgentCompanyProfileService,
    private otpService: OtpService,
    private jwtAuth: JwtAuthService,
    private deviceSessionService: DeviceSessionService,
    private googleOAuthService: GoogleOAuthService
  ) {}

  async login(
    dto: LoginRequestDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponseDto> {
    try {
      const { email, phoneNumber, password, device } = dto;

      if (!email && !phoneNumber) {
        throw new UnauthorizedException(
          'Either email or phone number is required'
        );
      }

      let user: User | null = null;
      if (email) {
        user = await this.usersService.findByEmail(email);
      } else if (phoneNumber) {
        user = await this.usersService.findByPhoneNumber(phoneNumber);
      }

      if (!user) {
        await this.logLoginAttempt(
          null,
          false,
          'User not found',
          ipAddress,
          userAgent
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!user.isActive) {
        await this.logLoginAttempt(
          user,
          false,
          'Account deactivated',
          ipAddress,
          userAgent
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = user.password
        ? await bcrypt.compare(password, user.password)
        : false;

      if (!isPasswordValid) {
        await this.logLoginAttempt(
          user,
          false,
          'Invalid password',
          ipAddress,
          userAgent
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      // Determine device type
      const deviceType = this.mapDeviceType(device?.deviceType);

      // Generate tokens
      const tokens = await this.jwtAuth.generateTokenPair(
        user.id,
        user.roles || [UserType.BUYER.toString()],
        deviceType
      );

      // Store device session if device info provided
      if (device?.deviceId) {
        await this.deviceSessionService.createOrUpdateSession(
          user.id,
          {
            deviceType: deviceType,
            deviceId: device.deviceId,
            platform: device.platform,
            firebaseToken: device.firebaseToken,
            userAgent,
            ipAddress
          },
          await this.hashToken(tokens.refreshToken)
        );
      }

      await this.logLoginAttempt(
        user,
        true,
        'Login successful',
        ipAddress,
        userAgent
      );

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: await this.mapUserToUserInfoDto(user)
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async googleCallBack(code: string, state: string): Promise<LoginResponseDto> {
    try {
      // 🔐 0. Decrypt & validate OAuth state INSIDE service
      const { device, ipAddress, userAgent, referralCode } =
        this.googleOAuthService.decryptAndValidateState(state);

      // 1. Verify Google identity
      const { googleId, email } =
        await this.googleOAuthService.verifyCode(code);

      // 2. Find user by googleId FIRST
      let user = await this.userRepository.findOne({
        where: { googleId }
      });

      // 3. Check if user exists by email if not found by googleId
      if (!user) {
        const emailUser = await this.userRepository.findOne({
          where: { email }
        });

        if (emailUser) {
          // LINK existing local user
          emailUser.googleId = googleId;
          emailUser.isEmailVerified = true;
          user = await this.userRepository.save(emailUser);
        }
      }

      // 4. If user not found → new Google user (registration flow)
      if (!user) {
        return {
          isExistingUser: false,
          googleId,
          email,
          referralCode
        };
      }

      // 5. Active check (same as login)
      if (!user.isActive) {
        await this.logLoginAttempt(
          user,
          false,
          'Account deactivated',
          ipAddress,
          userAgent
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      // 6. Device type
      const deviceType = this.mapDeviceType(device?.deviceType);

      // 7. Generate tokens (same as login)
      const tokens = await this.jwtAuth.generateTokenPair(
        user.id,
        user.roles || [UserType.BUYER.toString()],
        deviceType
      );

      // 8. Device session (same as login)
      if (device?.deviceId) {
        await this.deviceSessionService.createOrUpdateSession(
          user.id,
          {
            deviceType,
            deviceId: device.deviceId,
            platform: device.platform,
            firebaseToken: device.firebaseToken,
            userAgent,
            ipAddress
          },
          await this.hashToken(tokens.refreshToken)
        );
      }

      // 9. Login log
      await this.logLoginAttempt(
        user,
        true,
        'Google login successful',
        ipAddress,
        userAgent
      );

      // 10. Return SAME response shape as login()
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: await this.mapUserToUserInfoDto(user),
        isExistingUser: true
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async startGoogleAuth(
    ipAddress: string,
    userAgent: string,
    device: DeviceInfoDto,
    referralCode?: string
  ) {
    const state = this.googleOAuthService.buildEncryptedState({
      device: device,
      ipAddress: ipAddress,
      userAgent: userAgent,
      referralCode: referralCode
    });

    const url = this.googleOAuthService.getGoogleOAuthUrl(state);
    return url;
  }

  async verifyLoginOtp(
    dto: VerifyOtpDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponseDto> {
    try {
      let otpPurpose: OtpPurpose = OtpPurpose.LOGIN;
      let user = await this.usersService.findByPhoneNumber(dto.phoneNumber);
      let isNewUser = false;

      if (!user) {
        otpPurpose = OtpPurpose.REGISTRATION;
        isNewUser = true;
      }

      // Verify OTP
      const otpVerification = await this.otpService.verifyOtp(
        dto.phoneNumber,
        dto.otp,
        otpPurpose,
        ipAddress
      );

      if (!otpVerification.isValid) {
        await this.logLoginAttempt(
          user,
          false,
          'Invalid or expired OTP',
          ipAddress,
          userAgent
        );
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      // Create new user if registration
      if (isNewUser) {
        if (!dto.user) {
          throw new UnauthorizedException(
            'User details required for registration'
          );
        }

        user = await this.usersService.createWithReferral({
          email: dto.user?.email,
          firstName: dto.user?.firstName,
          lastName: dto.user?.lastName,
          phoneNumber: dto.phoneNumber,
          isActive: true,
          referredByCode: dto.user?.referralCode
        });
      }

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (!user.isActive) {
        await this.logLoginAttempt(
          user,
          false,
          'Account deactivated',
          ipAddress,
          userAgent
        );
        throw new UnauthorizedException('Account deactivated');
      }

      // ✅ UPDATE PHONE VERIFICATION STATUS
      if (!user.isPhoneVerified) {
        await this.userRepository.update(user.id, {
          isPhoneVerified: true,
          phoneVerifiedAt: new Date()
        });
        user.isPhoneVerified = true;
        user.phoneVerifiedAt = new Date();
      }

      // Determine device type
      const deviceType = this.mapDeviceType(dto.device?.deviceType);

      // Generate tokens
      const tokens = await this.jwtAuth.generateTokenPair(
        user.id,
        user.roles || [UserType.BUYER.toString()],
        deviceType
      );

      // ✅ STORE DEVICE SESSION with Firebase Token
      if (dto.device?.deviceId) {
        await this.deviceSessionService.createOrUpdateSession(
          user.id,
          {
            deviceType: deviceType,
            deviceId: dto.device.deviceId,
            platform: dto.device.platform,
            firebaseToken: dto.device.firebaseToken,
            userAgent,
            ipAddress
          },
          await this.hashToken(tokens.refreshToken)
        );
      }

      await this.logLoginAttempt(
        user,
        true,
        'OTP login successful',
        ipAddress,
        userAgent
      );

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: await this.mapUserToUserInfoDto(user)
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException(error);
    }
  }

  async refreshTokens(
    userId: string,
    deviceType: DeviceType = DeviceType.WEB
  ): Promise<LoginResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    // ✅ FIX: Capture full response including expiresIn
    const tokens = this.jwtAuth.generateTokenPair(
      user.id,
      user.roles || [UserType.BUYER.toString()],
      deviceType
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: await this.mapUserToUserInfoDto(user)
    };
  }

  async upgradeJwtAuthByUserId(
    userId: string,
    rolesAllowed: string[] = ['USER'],
    deviceType: DeviceType = DeviceType.WEB
  ): Promise<LoginResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    const userRoles = user.roles || [UserType.BUYER.toString()];
    const hasRequiredRole =
      rolesAllowed.length === 0 ||
      userRoles.some((r) => rolesAllowed.includes(r));

    if (!hasRequiredRole) {
      throw new UnauthorizedException(
        'Insufficient role to upgrade authentication'
      );
    }

    // ✅ FIX: Capture full response including expiresIn
    const tokens = this.jwtAuth.generateTokenPair(
      user.id,
      userRoles,
      deviceType
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: await this.mapUserToUserInfoDto(user)
    };
  }

  async signOut(
    userId: string,
    deviceId?: string
  ): Promise<{ message: string }> {
    if (deviceId) {
      // Deactivate specific device session
      await this.deviceSessionService.deactivateSession(userId, deviceId);
    } else {
      // Deactivate all sessions
      await this.deviceSessionService.deactivateAllUserSessions(userId);
    }
    return { message: 'Signed out successfully' };
  }

  // ✅ UPDATED: Consistent user mapping with all fields
  async mapUserToUserInfoDto(user: User): Promise<UserInfoDto> {
    const dto = new UserInfoDto();

    dto.id = user.id;
    dto.email = user.email;
    dto.phoneNumber = user.phoneNumber;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.isActive = user.isActive ?? false;
    dto.roles = user.roles ?? [];

    // ✅ Verification Status
    dto.isEmailVerified = user.isEmailVerified ?? false;
    dto.isPhoneVerified = user.isPhoneVerified ?? false;
    dto.isKycVerified = user.isKycVerified ?? false;

    // ✅ Profile Picture
    dto.profilePicture = user.profilePicture || '';

    // ✅ Referral Code
    dto.referralCode = user.referralCode || '';

    // Agent Profile
    dto.agent = undefined;

    const agentProfiles = await this.agentCompanyProfileService.findAllByUserId(
      user.id,
      {}
    );
    if (agentProfiles && agentProfiles.length > 0) {
      const agent = agentProfiles[0];
      dto.agent = {
        agent_id: agent.id,
        agent_name: agent.companyName,
        agent_profile_name: agent.profileName
      };
    }

    return dto;
  }

  // Helper to map device type string to enum
  private mapDeviceType(deviceType?: string): DeviceType {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return DeviceType.MOBILE;
      case 'ios':
        return DeviceType.IOS;
      case 'android':
        return DeviceType.ANDROID;
      case 'web':
      default:
        return DeviceType.WEB;
    }
  }

  // Helper to hash refresh token for storage
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  private async logLoginAttempt(
    user: User | null,
    success: boolean,
    details: string,
    ipAddress: string = 'unknown',
    userAgent: string = 'unknown'
  ): Promise<void> {
    try {
      const loginHistory = this.loginHistoryRepository.create({
        user,
        ipAddress,
        userAgent
      });
      await this.loginHistoryRepository.save(loginHistory);
    } catch (error) {
      console.error('Failed to log login attempt:', error);
    }
  }

  async sendLoginOtp(
    phoneNumber: string,
    optTypes: OtpType[],
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ message: string; isExistingUser: boolean }> {
    try {
      const user = await this.usersService.findByPhoneNumber(phoneNumber);

      const message = await this.otpService.generateAndSendOtp(
        phoneNumber,
        user?.email,
        user ? OtpPurpose.LOGIN : OtpPurpose.REGISTRATION,
        optTypes,
        user?.id,
        ipAddress,
        userAgent
      );

      return {
        ...message,
        isExistingUser: user !== null
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error.message || 'Failed to send OTP'
      );
    }
  }
}
