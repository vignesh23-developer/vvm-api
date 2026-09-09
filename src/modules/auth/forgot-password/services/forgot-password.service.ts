import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException
} from '@nestjs/common';
import { BusinessException } from '../../../../common';
import { ProfileService } from '../../../users';
import { OtpPurpose, OtpService, OtpType } from '../../../shared';
import {
  ForgotPasswordResponseDto,
  ResetPasswordDto,
  ResetPasswordResponseDto
} from '../dto';

@Injectable()
export class ForgotPasswordService {
  constructor(
    private usersService: ProfileService,
    private otpService: OtpService
  ) {}

  async sendResetOtp(
    phoneNumber: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ForgotPasswordResponseDto> {
    try {
      const user = await this.usersService.findByPhoneNumber(phoneNumber);
      if (!user) {
        throw new UnauthorizedException('Phone number not registered');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      const otpResult = await this.otpService.generateAndSendOtp(
        user.phoneNumber,
        user.email,
        OtpPurpose.FORGOT_PASSWORD,
        OtpType.SMS_OTP,
        user.id,
        ipAddress,
        userAgent
      );

      return {
        message:
          otpResult.message ||
          'Password reset OTP has been sent to your phone number',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (
        error instanceof BusinessException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to process password reset request'
      );
    }
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ResetPasswordResponseDto> {
    try {
      const { phoneNumber, otp, newPassword } = resetPasswordDto;

      const user = await this.usersService.findByPhoneNumber(phoneNumber);
      if (!user || !user.isActive) {
        throw new BadRequestException(
          'User not found or account is deactivated'
        );
      }

      const otpVerification = await this.otpService.verifyOtp(
        user.phoneNumber,
        otp,
        OtpPurpose.FORGOT_PASSWORD,
        ipAddress
      );

      if (!otpVerification.isValid) {
        throw new BadRequestException('Invalid or expired OTP');
      }

      await this.usersService.resetPasswordWithOtp(user.id, newPassword);

      return {
        message: 'Password has been reset successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof BusinessException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to reset password');
    }
  }
}
