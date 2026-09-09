import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { maskNumbers } from '../../utils/mask-numbers';
import { formatPhoneNumber } from '../../utils/format-phone-number';

export interface WhatsAppSendDto {
  phoneNumber: string;
  templateName: string;
  languageCode?: string;
  bodyParameters?: string[];
  headerType?: 'none' | 'text' | 'image' | 'document' | 'video';
  headerVariables?: string[];
  buttonType?: 'none' | 'url' | 'quick_reply' | 'call';
  buttonUrlVariable?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

interface WhatsAppComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: string;
  index?: string;
  parameters: Array<{
    type: string;
    text?: string;
    image?: { link: string };
    document?: { link: string };
    video?: { link: string };
  }>;
}

interface WhatsAppPayload {
  to: string;
  type: 'template';
  template: {
    language: { policy: string; code: string };
    name: string;
    components: WhatsAppComponent[];
  };
}

interface WhatsAppApiResponse {
  success: boolean;
  message_id?: string;
  error?: { code: string; message: string };
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly apiUrl: string;
  private readonly apiToken: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL', '');
    this.apiToken = this.configService.get<string>('WHATSAPP_API_TOKEN', '');
  }

  async send(dto: WhatsAppSendDto): Promise<WhatsAppSendResult> {
    const {
      phoneNumber,
      templateName,
      languageCode = 'en',
      bodyParameters = [],
      headerType = 'none',
      headerVariables = [],
      buttonType = 'none',
      buttonUrlVariable,
    } = dto;

    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Dev mode - log only
    if (!this.apiUrl || !this.apiToken) {
      this.logger.debug(
        `[WhatsApp] Template: ${templateName} | To: ${formattedPhone} | Body: ${bodyParameters.join(', ')}`,
      );
      return { success: true, messageId: `dev-${Date.now()}` };
    }

    // Build components
    const components = this.buildComponents({
      bodyParameters,
      headerType,
      headerVariables,
      buttonType,
      buttonUrlVariable,
    });

    const payload: WhatsAppPayload = {
      to: formattedPhone,
      type: 'template',
      template: {
        language: { policy: 'deterministic', code: languageCode },
        name: templateName,
        components,
      },
    };

    try {
      const url = `${this.apiUrl}?token=${this.apiToken}`;
      const response = await firstValueFrom(
        this.httpService.post<WhatsAppApiResponse>(url, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }),
      );

      if (!response.data.success && response.data.error) {
        this.logger.error(
          `WhatsApp failed | Template: ${templateName} | Error: ${response.data.error.message}`,
        );
        return {
          success: false,
          error: response.data.error.message,
          errorCode: response.data.error.code,
        };
      }

      this.logger.log(
        `WhatsApp sent | Template: ${templateName} | To: ${maskNumbers(formattedPhone)} | MsgID: ${response.data.message_id}`,
      );
      return { success: true, messageId: response.data.message_id };
    } catch (error: any) {
      return this.handleError(error, templateName, formattedPhone);
    }
  }

  private buildComponents(params: {
    bodyParameters: string[];
    headerType: string;
    headerVariables: string[];
    buttonType: string;
    buttonUrlVariable?: string;
  }): WhatsAppComponent[] {
    const components: WhatsAppComponent[] = [];

    // Header component (if needed)
    if (params.headerType !== 'none' && params.headerVariables?.length > 0) {
      const headerComponent: WhatsAppComponent = {
        type: 'header',
        parameters: [],
      };

      switch (params.headerType) {
        case 'text':
          headerComponent.parameters = params.headerVariables.map((text) => ({
            type: 'text',
            text,
          }));
          break;
        case 'image':
          headerComponent.parameters.push({
            type: 'image',
            image: { link: params.headerVariables[0] },
          });
          break;
        case 'document':
          headerComponent.parameters.push({
            type: 'document',
            document: { link: params.headerVariables[0] },
          });
          break;
        case 'video':
          headerComponent.parameters.push({
            type: 'video',
            video: { link: params.headerVariables[0] },
          });
          break;
      }

      if (headerComponent.parameters.length > 0) {
        components.push(headerComponent);
      }
    }

    // Body component (if has parameters)
    if (params.bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: params.bodyParameters.map((text) => ({ type: 'text', text })),
      });
    }

    // Button component (if needed)
    if (params.buttonType !== 'none' && params.buttonUrlVariable) {
      components.push({
        type: 'button',
        sub_type: params.buttonType,
        index: '0',
        parameters: [{ type: 'text', text: params.buttonUrlVariable }],
      });
    }

    return components;
  }

  private handleError(
    error: any,
    templateName: string,
    phone: string,
  ): WhatsAppSendResult {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      this.logger.error(
        `WhatsApp HTTP error | Template: ${templateName} | Status: ${status}`,
      );

      if (status === 401 || status === 403) {
        return { success: false, error: 'Auth failed', errorCode: 'AUTH_ERROR' };
      }
      if (status === 429) {
        return { success: false, error: 'Rate limit', errorCode: 'RATE_LIMIT' };
      }
      return { success: false, error: error.message, errorCode: 'HTTP_ERROR' };
    }

    this.logger.error(
      `WhatsApp exception | Template: ${templateName} | Error: ${error.message}`,
    );
    return { success: false, error: error.message, errorCode: 'UNKNOWN_ERROR' };
  }
}