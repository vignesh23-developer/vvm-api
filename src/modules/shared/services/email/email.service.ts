import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';


@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.get<string>('EMAIL_FROM', '');
    this.fromName = this.configService.get<string>('APP_NAME', 'VaazhgaValamudan');
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    try {
      const host = this.configService.get<string>('EMAIL_SMTP_HOST');
      const port = this.configService.get<number>('EMAIL_SMTP_PORT', 587);
      const user = this.configService.get<string>('EMAIL_SMTP_USER');
      const pass = this.configService.get<string>('EMAIL_SMTP_PASSWORD');

      if (!host || !user || !pass) {
        this.logger.warn('SMTP not configured - emails will be logged only');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: this.configService.get<boolean>('EMAIL_SMTP_SECURE', false),
        auth: { user, pass },
      });

      this.logger.log('EmailService initialized');
    } catch (error: any) {
      this.logger.error(`SMTP init failed: ${error.message}`);
    }
  }

  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
    options?: {
      cc?: string | string[];
      bcc?: string | string[];
      replyTo?: string;
      attachments?: nodemailer.Attachment[];
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Dev mode - log only
    if (!this.transporter) {
      this.logger.debug(`📧 [Email] To: ${to} | Subject: ${subject}`);
      if (this.configService.get('NODE_ENV') === 'development') {
        this.logger.debug(`HTML: ${html.substring(0, 200)}...`);
      }
      return { success: true, messageId: `dev-${Date.now()}` };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
        ...options,
      });

      this.logger.log(`Email sent | To: ${this.mask(to)} | Subject: ${subject} | MsgID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };

    } catch (error: any) {
      this.logger.error(`Email failed | To: ${this.mask(to)} | Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private mask(email: string): string {
    const [local, domain] = email.split('@');
    return domain ? local.substring(0, 2) + '****@' + domain : '****';
  }
}