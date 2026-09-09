import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { DeviceType } from '../../shared/enums/device-type.enum';

export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh'
}

// Token TTL Configuration (in seconds)
const TOKEN_CONFIG = {
  access: {
    [DeviceType.WEB]: 120 * 60, // 2 hour - Short for web security
    [DeviceType.MOBILE]: 120 * 60, // 2 hour - Longer for mobile UX
    [DeviceType.IOS]: 120 * 60, // 2 hour
    [DeviceType.ANDROID]: 120 * 60 // 2 hour
  },
  refresh: {
    [DeviceType.WEB]: 7 * 24 * 60 * 60, // 7 days - Web users close browser
    [DeviceType.MOBILE]: 30 * 24 * 60 * 60, // 30 days - Mobile stays logged in
    [DeviceType.IOS]: 30 * 24 * 60 * 60, // 30 days
    [DeviceType.ANDROID]: 30 * 24 * 60 * 60 // 30 days
  }
};

// For "Remember Me" feature (optional)
const REMEMBER_ME_MULTIPLIER = 4; // 4x longer expiry

@Injectable()
export class JwtAuthService {
  constructor(private readonly jwt: JwtService) {}

  private normalizeDeviceType(deviceType?: string | DeviceType): DeviceType {
    if (!deviceType) return DeviceType.WEB;

    // Handle both string and enum
    const normalized = deviceType.toString().toLowerCase();

    switch (normalized) {
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

  private getAccessTtl(deviceType: DeviceType): number {
    return (
      TOKEN_CONFIG.access[deviceType] || TOKEN_CONFIG.access[DeviceType.WEB]
    );
  }

  private getRefreshTtl(deviceType: DeviceType, rememberMe = false): number {
    const baseTtl =
      TOKEN_CONFIG.refresh[deviceType] || TOKEN_CONFIG.refresh[DeviceType.WEB];
    return rememberMe ? baseTtl * REMEMBER_ME_MULTIPLIER : baseTtl;
  }

  generateTokenPair(
    userId: string,
    roles: string[],
    deviceType: string | DeviceType = DeviceType.WEB,
    rememberMe = false
  ): { accessToken: string; refreshToken: string; expiresIn: number } {
    const normalizedDeviceType = this.normalizeDeviceType(deviceType);

    const basePayload = {
      sub: userId,
      roles,
      dt: normalizedDeviceType
    };

    const accessTtl = this.getAccessTtl(normalizedDeviceType);
    const refreshTtl = this.getRefreshTtl(normalizedDeviceType, rememberMe);

    const accessToken = this.jwt.sign(
      { ...basePayload, typ: TokenType.ACCESS },
      { expiresIn: accessTtl } as JwtSignOptions
    );

    const refreshToken = this.jwt.sign(
      { ...basePayload, typ: TokenType.REFRESH },
      { expiresIn: refreshTtl } as JwtSignOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtl // Return expiry so frontend knows when to refresh
    };
  }

  // Generate only access token (for token refresh flow)
  generateAccessToken(
    userId: string,
    roles: string[],
    deviceType: string | DeviceType = DeviceType.WEB
  ): { accessToken: string; expiresIn: number } {
    const normalizedDeviceType = this.normalizeDeviceType(deviceType);
    const accessTtl = this.getAccessTtl(normalizedDeviceType);

    const accessToken = this.jwt.sign(
      {
        sub: userId,
        roles,
        dt: normalizedDeviceType,
        typ: TokenType.ACCESS
      },
      { expiresIn: accessTtl } as JwtSignOptions
    );

    return { accessToken, expiresIn: accessTtl };
  }

  // Verify and decode token
  verifyToken(token: string): any {
    try {
      return this.jwt.verify(token);
    } catch (error) {
      return null;
    }
  }

  // Decode without verification (for debugging/logging)
  decodeToken(token: string): any {
    return this.jwt.decode(token);
  }

  // Check if token is about to expire (for proactive refresh)
  isTokenExpiringSoon(token: string, thresholdSeconds = 300): boolean {
    try {
      const decoded = this.jwt.decode(token) as any;
      if (!decoded?.exp) return true;

      const expiresAt = decoded.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;

      return timeUntilExpiry < thresholdSeconds * 1000;
    } catch {
      return true;
    }
  }
}
