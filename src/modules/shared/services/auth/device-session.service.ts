import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSession } from '../../entities/device-session.entity';
import { DeviceType } from '../../enums/device-type.enum';

export interface DeviceInfo {
  deviceType: DeviceType;
  deviceId: string;
  platform?: string;
  firebaseToken?: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class DeviceSessionService {
  constructor(
    @InjectRepository(DeviceSession)
    private readonly deviceSessionRepository: Repository<DeviceSession>
  ) {}

  async createOrUpdateSession(
    userId: string,
    deviceInfo: DeviceInfo,
    refreshTokenHash?: string
  ): Promise<DeviceSession> {
    // Check if session exists for this device
    let session = await this.deviceSessionRepository.findOne({
      where: {
        referenceId: userId,
        deviceId: deviceInfo.deviceId
      }
    });

    if (session) {
      // Update existing session
      session.firebaseToken = deviceInfo.firebaseToken || session.firebaseToken;
      session.platform = deviceInfo.platform || session.platform;
      session.userAgent = deviceInfo.userAgent || session.userAgent;
      session.ipAddress = deviceInfo.ipAddress || session.ipAddress;
      session.refreshTokenHash = refreshTokenHash || session.refreshTokenHash;
      session.lastLoginAt = new Date();
      session.isActive = true;
    } else {
      // Create new session
      session = this.deviceSessionRepository.create({
        referenceId: userId,
        deviceId: deviceInfo.deviceId,
        deviceType: deviceInfo.deviceType,
        platform: deviceInfo.platform,
        firebaseToken: deviceInfo.firebaseToken,
        userAgent: deviceInfo.userAgent,
        ipAddress: deviceInfo.ipAddress,
        refreshTokenHash,
        lastLoginAt: new Date(),
        isActive: true
      });
    }

    return this.deviceSessionRepository.save(session);
  }

  async updateFirebaseToken(
    userId: string,
    deviceId: string,
    firebaseToken: string
  ): Promise<DeviceSession | null> {
    const session = await this.deviceSessionRepository.findOne({
      where: { referenceId: userId, deviceId }
    });

    if (session) {
      session.firebaseToken = firebaseToken;
      return this.deviceSessionRepository.save(session);
    }

    return null;
  }

  async getActiveSessionsByUser(userId: string): Promise<DeviceSession[]> {
    return this.deviceSessionRepository.find({
      where: { referenceId: userId, isActive: true },
      order: { lastLoginAt: 'DESC' }
    });
  }

  async getSessionsWithFirebaseToken(userId: string): Promise<DeviceSession[]> {
    return this.deviceSessionRepository
      .createQueryBuilder('session')
      .where('session.referenceId = :userId', { userId })
      .andWhere('session.isActive = true')
      .andWhere('session.firebaseToken IS NOT NULL')
      .andWhere("session.firebaseToken != ''")
      .getMany();
  }

  async deactivateSession(userId: string, deviceId: string): Promise<void> {
    await this.deviceSessionRepository.update(
      { referenceId: userId, deviceId },
      { isActive: false }
    );
  }

  async deactivateAllUserSessions(userId: string): Promise<void> {
    await this.deviceSessionRepository.update(
      { referenceId: userId },
      { isActive: false }
    );
  }

  async removeSession(userId: string, deviceId: string): Promise<void> {
    await this.deviceSessionRepository.delete({
      referenceId: userId,
      deviceId
    });
  }
}