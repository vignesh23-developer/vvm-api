import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpSender } from './otp-sender.interface';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class SmsOtpService implements OtpSender {
  private readonly logger = new Logger(SmsOtpService.name);

  private readonly templateId: string;
  private readonly validityMinutes: string;

  constructor(
    private readonly smsService: SmsService,
    private readonly configService: ConfigService
  ) {
    this.templateId = this.configService.get<string>(
      'FAST2SMS_TEMPLATE_ID',
      '205098'
    );
    this.validityMinutes = this.configService.get<string>(
      'FAST2SMS_OTP_VALIDITY_MINUTES',
      '10'
    );
  }

  async send(
    recipient: string,
    code: string,
    purposeText: string
  ): Promise<void> {
    if (this.configService.get('NODE_ENV') === 'development') {
      this.logger.debug(
        `[SMS] OTP for ${recipient}: ${code} (${purposeText})`
      );
    }

    // Use base SmsService with OTP template
    const result = await this.smsService.send({
      phoneNumber: recipient,
      templateId: this.templateId,
      variables: [code, this.validityMinutes]
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send OTP via SMS');
    }
  }
}
