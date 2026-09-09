import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpSender } from './otp-sender.interface';
import { EmailService } from '../email/email.service';

@Injectable()
export class EmailOtpService implements OtpSender {
  private readonly logger = new Logger(EmailOtpService.name);

  private readonly expiryMinutes: number;
  private readonly appName: string;

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService
  ) {
    this.expiryMinutes = this.configService.get<number>(
      'OTP_EXPIRY_MINUTES',
      10
    );
    this.appName = this.configService.get<string>(
      'APP_NAME',
      'VaazhgaValamudan'
    );
  }

  async send(
    recipient: string,
    code: string,
    purposeText: string
  ): Promise<void> {
    if (this.configService.get('NODE_ENV') === 'development') {
      this.logger.debug(
        `🔐 [Email] OTP for ${recipient}: ${code} (${purposeText})`
      );
    }

    const subject = `${code} is your verification code for ${this.appName}`;
    const html = this.generateHtmlEmail(code, purposeText);
    const text = this.generateTextEmail(code, purposeText);

    // Use base EmailService
    const result = await this.emailService.send(recipient, subject, html, text);

    if (!result.success) {
      throw new Error(
        result.error || 'Failed to send verification code via email'
      );
    }
  }

  private generateHtmlEmail(code: string, purposeText: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h2 style="color: white; margin: 0;">${this.appName}</h2>
    </div>
    <div style="padding: 30px; background: #fff; border: 1px solid #e9ecef; border-radius: 0 0 10px 10px;">
      <p>Hello,</p>
      <p>Your verification code for <strong>${purposeText}</strong>:</p>
      <div style="background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
        <div style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea;">${code}</div>
      </div>
      <p style="text-align: center; color: #666;">Expires in <strong>${this.expiryMinutes} minutes</strong></p>
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 25px; font-size: 14px; color: #856404;">
        <strong>⚠️ Security:</strong> Never share this code. We will never ask for it.
      </div>
    </div>
    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #6c757d;">
      <p>&copy; ${new Date().getFullYear()} ${this.appName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
  }

  private generateTextEmail(code: string, purposeText: string): string {
    return `${this.appName} - Verification Code

Your verification code for ${purposeText}: ${code}

Expires in ${this.expiryMinutes} minutes.

Security: Never share this code. We will never ask for it.

© ${new Date().getFullYear()} ${this.appName}`;
  }
}
