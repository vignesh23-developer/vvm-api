import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskNumbers } from '../../utils/mask-numbers';
import { formatPhoneNumber } from '../../utils/format-phone-number';

export interface SmsSendParams {
  phoneNumber: string | string[];
  templateId: string;
  variables: string[];
}

export interface SmsSendResult {
  success: boolean;
  requestId?: string;
  error?: string;
  errorCode?: string;
}

interface Fast2SmsResponse {
  return: boolean;
  request_id: string;
  message: string[];
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly senderId: string;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>(
      'FAST2SMS_API_URL',
      'https://www.fast2sms.com/dev/bulkV2',
    );
    this.apiToken = this.configService.get<string>('FAST2SMS_API_TOKEN', '');
    this.senderId = this.configService.get<string>('FAST2SMS_SENDER_ID', '');
    this.isEnabled = !!this.apiToken && !!this.senderId;

    if (!this.isEnabled) {
      this.logger.warn('Fast2SMS not configured - SMS will be logged only');
    } else {
      this.logger.log('SmsService initialized');
    }
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const { phoneNumber, templateId, variables } = params;

    // Format phone numbers
    const numbers = Array.isArray(phoneNumber)
      ? phoneNumber.map((p) => formatPhoneNumber(p)).join(',')
      : formatPhoneNumber(phoneNumber);

    // Development/disabled mode - just log
    if (!this.isEnabled) {
      this.logger.debug(
        `📱 [SMS] Template: ${templateId} | To: ${numbers} | Vars: ${variables.join('|')}`,
      );
      return { success: true, requestId: `dev-${Date.now()}` };
    }

    // Build payload
    const payload = {
      route: 'dlt',
      sender_id: this.senderId,
      message: templateId,
      variables_values: variables.join('|'),
      numbers: numbers,
      flash: 0,
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'authorization': this.apiToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result: Fast2SmsResponse = await response.json();

      if (!result.return) {
        const errorMsg = Array.isArray(result.message)
          ? result.message.join(', ')
          : String(result.message);

        this.logger.error(`SMS failed | Template: ${templateId} | Error: ${errorMsg}`);

        return {
          success: false,
          error: errorMsg,
          errorCode: 'API_ERROR',
        };
      }

      this.logger.log(
        `SMS sent | Template: ${templateId} | To: ${maskNumbers(numbers)} | ReqID: ${result.request_id}`,
      );

      return {
        success: true,
        requestId: result.request_id,
      };
    } catch (error: any) {
      this.logger.error(`SMS exception | Template: ${templateId} | Error: ${error.message}`);

      return {
        success: false,
        error: error.message,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  isConfigured(): boolean {
    return this.isEnabled;
  }

}