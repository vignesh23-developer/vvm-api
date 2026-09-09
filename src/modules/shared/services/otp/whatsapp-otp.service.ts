import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpSender } from './otp-sender.interface';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class WhatsAppOtpService implements OtpSender {
  private readonly logger = new Logger(WhatsAppOtpService.name);

  private readonly templateName: string;
  private readonly languageCode: string;

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly configService: ConfigService
  ) {
    this.templateName = this.configService.get<string>(
      'WHATSAPP_TEMPLATE_NAME',
      ''
    );
    this.languageCode = this.configService.get<string>(
      'WHATSAPP_LANGUAGE_CODE',
      'en'
    );
  }

  async send(
    recipient: string,
    code: string,
    purposeText: string
  ): Promise<void> {
    if (this.configService.get('NODE_ENV') === 'development') {
      this.logger.debug(
        `🔐 [WhatsApp] OTP for ${recipient}: ${code} (${purposeText})`
      );

      if (this.configService.get('WHATSAPP_ENABLED') === 'false') {
        this.logger.debug('Skipping WhatsApp API call in development mode');
        return;
      }
    }

    const result = await this.whatsAppService.send({
      phoneNumber: recipient,
      templateName: this.templateName,
      languageCode: this.languageCode,
      bodyParameters: [code],
      buttonType: 'url',
      buttonUrlVariable: code
    });

    if (!result.success) {
      throw new WhatsAppApiError(
        result.errorCode || 'UNKNOWN',
        result.error || 'Failed to send OTP'
      );
    }
  }
}

export class WhatsAppApiError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'WhatsAppApiError';
  }
}
