import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { DeviceInfoDto } from '../login/dto/device-info.dto';

@Injectable()
export class GoogleOAuthService {
  private client: OAuth2Client;

  // AES-256-GCM settings
  private readonly ALGO = 'aes-256-gcm';
  private readonly STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly STATE_KEY = Buffer.from(
    process.env.OAUTH_STATE_SECRET!, // MUST be 32 bytes (hex)
    'hex'
  );

  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /* =====================================================
     GOOGLE CALLBACK: verify code → identity
     ===================================================== */
  async verifyCode(code: string) {
    const { tokens } = await this.client.getToken(code);

    if (!tokens.id_token) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google payload');
    }

    if (!payload.email_verified) {
      throw new UnauthorizedException('Google email not verified');
    }

    return {
      googleId: payload.sub,
      email: payload.email
    };
  }

  /* =====================================================
     OAUTH START: build Google URL
     ===================================================== */
  getGoogleOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /* =====================================================
     STATE: encrypt metadata
     ===================================================== */
  buildEncryptedState(data: {
    device?: DeviceInfoDto;
    ipAddress?: string;
    userAgent?: string;
    referralCode?: string;
  }): string {
    const payload = {
      ...data,
      exp: Date.now() + this.STATE_TTL_MS,
      nonce: crypto.randomUUID()
    };

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.ALGO, this.STATE_KEY, iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  /* =====================================================
     STATE: decrypt + validate
     ===================================================== */
  decryptAndValidateState(state: string): {
    device?: DeviceInfoDto;
    ipAddress?: string;
    userAgent?: string;
    referralCode?: string;
  } {
    try {
      const buffer = Buffer.from(state, 'base64url');

      const iv = buffer.subarray(0, 12);
      const tag = buffer.subarray(12, 28);
      const encrypted = buffer.subarray(28);

      const decipher = crypto.createDecipheriv(
        this.ALGO,
        this.STATE_KEY,
        iv
      );
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      const payload = JSON.parse(decrypted.toString('utf8'));

      if (!payload.exp || Date.now() > payload.exp) {
        throw new UnauthorizedException('OAuth state expired');
      }

      return {
        device: payload.device,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
        referralCode: payload.referralCode
      };
    } catch {
      throw new UnauthorizedException('Invalid OAuth state');
    }
  }
}
