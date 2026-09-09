import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import * as admin from 'firebase-admin';
import { Not, IsNull } from 'typeorm';
import { DeviceSession } from '../../shared';


export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  imageUrl?: string;
  clickAction?: string;
  sound?: string;
  data?: Record<string, string>;
}

export interface PushResult {
  success: boolean;
  deviceSessionId: string;
  firebaseToken: string;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

export interface BulkPushResult {
  totalSent: number;
  successCount: number;
  failureCount: number;
  results: PushResult[];
  invalidTokens: string[];
}

@Injectable()
export class PushService implements OnModuleInit {
  private fcmApp: admin.app.App | null = null;

  constructor(
    @InjectRepository(DeviceSession)
    private readonly deviceSessionRepo: Repository<DeviceSession>,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PushService.name);
  }

  // ============================================
  // INITIALIZE FCM
  // ============================================

  async onModuleInit() {
    await this.initializeFCM();
  }

  private async initializeFCM(): Promise<void> {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn('Firebase credentials not configured - Push notifications disabled');
        return;
      }

      // Check if already initialized
      if (admin.apps.length > 0) {
        this.fcmApp = admin.apps[0];
        this.logger.info('FCM app already initialized');
        return;
      }

      this.fcmApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });

      this.logger.info({ projectId }, 'FCM initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize FCM');
    }
  }

  // ============================================
  // GET ACTIVE DEVICE SESSIONS FOR USER
  // ============================================

  async getActiveDeviceSessions(userId: string): Promise<DeviceSession[]> {
    return this.deviceSessionRepo.find({
      where: {
        referenceId: userId,
        isActive: true,
        firebaseToken: Not(IsNull()),
      },
      order: { lastLoginAt: 'DESC' },
    });
  }

  // ============================================
  // SEND PUSH TO SINGLE DEVICE
  // ============================================

  async sendToDevice(
    firebaseToken: string,
    payload: PushPayload,
    deviceSessionId?: string,
  ): Promise<PushResult> {
    if (!this.fcmApp) {
      return {
        success: false,
        deviceSessionId: deviceSessionId || '',
        firebaseToken,
        error: 'FCM not initialized',
        errorCode: 'FCM_NOT_INITIALIZED',
      };
    }

    try {
      const message: admin.messaging.Message = {
        token: firebaseToken,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        android: {
          priority: 'high',
          notification: {
            icon: payload.icon || 'ic_notification',
            sound: payload.sound || 'default',
            clickAction: payload.clickAction,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: payload.sound || 'default',
              badge: 1,
            },
          },
        },
        webpush: payload.clickAction
          ? {
            fcmOptions: {
              link: payload.clickAction,
            },
          }
          : undefined,
        data: payload.data,
      };

      const response = await admin.messaging().send(message);

      this.logger.debug({ deviceSessionId, messageId: response }, 'Push sent successfully');

      return {
        success: true,
        deviceSessionId: deviceSessionId || '',
        firebaseToken,
        messageId: response,
      };
    } catch (error: any) {
      this.logger.error({ error, deviceSessionId, firebaseToken: firebaseToken.substring(0, 20) }, 'Push failed');

      const errorCode = error.code || 'UNKNOWN';

      // Handle invalid tokens
      if (this.isInvalidTokenError(errorCode)) {
        await this.handleInvalidToken(firebaseToken);
      }

      return {
        success: false,
        deviceSessionId: deviceSessionId || '',
        firebaseToken,
        error: error.message,
        errorCode,
      };
    }
  }

  // ============================================
  // SEND PUSH TO USER (ALL DEVICES)
  // ============================================

  async sendToUser(userId: string, payload: PushPayload): Promise<BulkPushResult> {
    const sessions = await this.getActiveDeviceSessions(userId);

    if (sessions.length === 0) {
      this.logger.debug({ userId }, 'No active device sessions with Firebase token');
      return {
        totalSent: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
        invalidTokens: [],
      };
    }

    const results: PushResult[] = [];
    const invalidTokens: string[] = [];

    for (const session of sessions) {
      if (!session.firebaseToken) continue;

      const result = await this.sendToDevice(
        session.firebaseToken,
        payload,
        session.id,
      );

      results.push(result);

      if (!result.success && this.isInvalidTokenError(result.errorCode)) {
        invalidTokens.push(session.firebaseToken);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    this.logger.info(
      { userId, totalSent: results.length, successCount, failureCount },
      'Push batch completed',
    );

    return {
      totalSent: results.length,
      successCount,
      failureCount,
      results,
      invalidTokens,
    };
  }

  // ============================================
  // SEND PUSH TO MULTIPLE USERS
  // ============================================

  async sendToUsers(
    userIds: string[],
    payload: PushPayload,
  ): Promise<Map<string, BulkPushResult>> {
    const resultsMap = new Map<string, BulkPushResult>();

    // Process in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((userId) => this.sendToUser(userId, payload)),
      );

      batch.forEach((userId, index) => {
        resultsMap.set(userId, batchResults[index]);
      });
    }

    return resultsMap;
  }

  // ============================================
  // SEND TO TOPIC (For broadcasts)
  // ============================================

  async sendToTopic(topic: string, payload: PushPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.fcmApp) {
      return { success: false, error: 'FCM not initialized' };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data,
      };

      const response = await admin.messaging().send(message);

      this.logger.info({ topic, messageId: response }, 'Topic push sent');

      return { success: true, messageId: response };
    } catch (error: any) {
      this.logger.error({ error, topic }, 'Topic push failed');
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // SUBSCRIBE USER TO TOPIC
  // ============================================

  async subscribeToTopic(userId: string, topic: string): Promise<boolean> {
    if (!this.fcmApp) return false;

    const sessions = await this.getActiveDeviceSessions(userId);
    const tokens: any = sessions
      .filter((s) => s.firebaseToken)
      .map((s) => s.firebaseToken);

    if (tokens.length === 0) return false;

    try {
      await admin.messaging().subscribeToTopic(tokens, topic);
      this.logger.info({ userId, topic, tokenCount: tokens.length }, 'Subscribed to topic');
      return true;
    } catch (error) {
      this.logger.error({ error, userId, topic }, 'Failed to subscribe to topic');
      return false;
    }
  }

  // ============================================
  // UNSUBSCRIBE USER FROM TOPIC
  // ============================================

  async unsubscribeFromTopic(userId: string, topic: string): Promise<boolean> {
    if (!this.fcmApp) return false;

    const sessions = await this.getActiveDeviceSessions(userId);
    const tokens: any = sessions
      .filter((s) => s.firebaseToken)
      .map((s) => s.firebaseToken);

    if (tokens.length === 0) return false;

    try {
      await admin.messaging().unsubscribeFromTopic(tokens, topic);
      this.logger.info({ userId, topic, tokenCount: tokens.length }, 'Unsubscribed from topic');
      return true;
    } catch (error) {
      this.logger.error({ error, userId, topic }, 'Failed to unsubscribe from topic');
      return false;
    }
  }

  // ============================================
  // HANDLE INVALID TOKENS
  // ============================================

  private isInvalidTokenError(errorCode?: string): boolean {
    const invalidTokenCodes = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument',
    ];
    return errorCode ? invalidTokenCodes.includes(errorCode) : false;
  }

  private async handleInvalidToken(firebaseToken: string): Promise<void> {
    try {
      // Deactivate sessions with this token
      await this.deviceSessionRepo.update(
        { firebaseToken },
        {
          isActive: false,
          firebaseToken: undefined,
        },
      );
      this.logger.info({ firebaseToken: firebaseToken.substring(0, 20) }, 'Invalid token deactivated');
    } catch (error) {
      this.logger.error({ error }, 'Failed to deactivate invalid token');
    }
  }

  // ============================================
  // UPDATE FIREBASE TOKEN FOR SESSION
  // ============================================

  async updateFirebaseToken(
    sessionId: string,
    firebaseToken: string,
  ): Promise<void> {
    await this.deviceSessionRepo.update(sessionId, { firebaseToken });
    this.logger.debug({ sessionId }, 'Firebase token updated');
  }

  // ============================================
  // CHECK FCM STATUS
  // ============================================

  isEnabled(): boolean {
    return this.fcmApp !== null;
  }
}

