import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationCategory, NotificationChannel } from '../enums/notification.enum';
import { UpdatePreferenceDto, QuietHoursDto } from '../dto';

export interface ChannelPreferences {
  in_app: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export interface PreferenceCheckResult {
  allowed: boolean;
  reason?: string;
  quietHours?: boolean;
}

@Injectable()
export class PreferenceService {
  // Default preferences for new users
  private readonly DEFAULT_PREFERENCES: ChannelPreferences = {
    in_app: true,
    push: true,
    email: true,
    sms: true,
    whatsapp: true,
  };

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly prefRepo: Repository<NotificationPreference>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PreferenceService.name);
  }

  // ============================================
  // GET USER PREFERENCES
  // ============================================

  async getUserPreferences(userId: string): Promise<NotificationPreference[]> {
    return this.prefRepo.find({
      where: { user_id: userId },
      order: { category: 'ASC' },
    });
  }

  // ============================================
  // GET PREFERENCE BY CATEGORY
  // ============================================

  async getPreferenceByCategory(
    userId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference | null> {
    return this.prefRepo.findOne({
      where: { user_id: userId, category },
    });
  }

  // ============================================
  // GET OR CREATE DEFAULT PREFERENCE
  // ============================================

  async getOrCreatePreference(
    userId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference> {
    let preference = await this.getPreferenceByCategory(userId, category);

    if (!preference) {
      preference = this.prefRepo.create({
        user_id: userId,
        category,
        ...this.DEFAULT_PREFERENCES,
        email_frequency: 'instant',
      });
      await this.prefRepo.save(preference);
      this.logger.debug({ userId, category }, 'Default preference created');
    }

    return preference;
  }

  // ============================================
  // UPDATE PREFERENCE
  // ============================================

  async updatePreference(
    userId: string,
    category: NotificationCategory,
    dto: UpdatePreferenceDto,
  ): Promise<NotificationPreference> {
    let preference = await this.getPreferenceByCategory(userId, category);

    if (!preference) {
      preference = this.prefRepo.create({
        user_id: userId,
        category,
        ...this.DEFAULT_PREFERENCES,
      });
    }

    // Update fields
    if (dto.in_app_enabled !== undefined) preference.in_app_enabled = dto.in_app_enabled;
    if (dto.push_enabled !== undefined) preference.push_enabled = dto.push_enabled;
    if (dto.email_enabled !== undefined) preference.email_enabled = dto.email_enabled;
    if (dto.sms_enabled !== undefined) preference.sms_enabled = dto.sms_enabled;
    if (dto.whatsapp_enabled !== undefined) preference.whatsapp_enabled = dto.whatsapp_enabled;
    if (dto.email_frequency !== undefined) preference.email_frequency = dto.email_frequency;
    if (dto.quiet_hours !== undefined) preference.quiet_hours = dto.quiet_hours;

    await this.prefRepo.save(preference);

    this.logger.info({ userId, category }, 'Preference updated');
    return preference;
  }

  // ============================================
  // UPDATE QUIET HOURS
  // ============================================

  async updateQuietHours(
    userId: string,
    quietHours: QuietHoursDto,
  ): Promise<void> {
    // Update all categories with new quiet hours
    const preferences = await this.getUserPreferences(userId);

    for (const pref of preferences) {
      pref.quiet_hours = quietHours;
      await this.prefRepo.save(pref);
    }

    // Create missing categories with quiet hours
    const existingCategories = preferences.map((p) => p.category);
    const allCategories = Object.values(NotificationCategory);

    for (const category of allCategories) {
      if (!existingCategories.includes(category)) {
        const newPref = this.prefRepo.create({
          user_id: userId,
          category,
          ...this.DEFAULT_PREFERENCES,
          quiet_hours: quietHours,
        });
        await this.prefRepo.save(newPref);
      }
    }

    this.logger.info({ userId }, 'Quiet hours updated for all categories');
  }

  // ============================================
  // CHECK IF CHANNEL ALLOWED FOR USER
  // ============================================

  async isChannelAllowed(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel,
  ): Promise<PreferenceCheckResult> {
    const preference = await this.getOrCreatePreference(userId, category);

    // Check channel preference
    let channelEnabled = true;
    switch (channel) {
      case NotificationChannel.IN_APP:
        channelEnabled = preference.in_app_enabled;
        break;
      case NotificationChannel.SSE:
        // SSE follows the same preference as IN_APP since it's the real-time delivery for in-app
        channelEnabled = preference.in_app_enabled;
        break;
      case NotificationChannel.PUSH:
        channelEnabled = preference.push_enabled;
        break;
      case NotificationChannel.EMAIL:
        channelEnabled = preference.email_enabled;
        break;
      case NotificationChannel.SMS:
        channelEnabled = preference.sms_enabled;
        break;
      case NotificationChannel.WHATSAPP:
        channelEnabled = preference.whatsapp_enabled;
        break;
    }

    if (!channelEnabled) {
      return {
        allowed: false,
        reason: `User has disabled ${channel} for ${category}`,
      };
    }

    // Check quiet hours (except for OTP and urgent messages)
    if (
      category !== NotificationCategory.OTP &&
      this.isInQuietHours(preference.quiet_hours)
    ) {
      // Allow in_app and SSE even during quiet hours
      if (channel === NotificationChannel.IN_APP || channel === NotificationChannel.SSE) {
        return { allowed: true };
      }

      return {
        allowed: false,
        reason: 'User is in quiet hours',
        quietHours: true,
      };
    }

    return { allowed: true };
  }

  // ============================================
  // CHECK QUIET HOURS
  // ============================================

  private isInQuietHours(quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  }): boolean {
    if (!quietHours?.enabled) return false;

    try {
      const now = new Date();
      const timezone = quietHours.timezone || 'Asia/Kolkata';

      // Get current time in user's timezone
      const userTime = new Date(
        now.toLocaleString('en-US', { timeZone: timezone }),
      );

      const currentHour = userTime.getHours();
      const currentMinute = userTime.getMinutes();
      const currentTotalMinutes = currentHour * 60 + currentMinute;

      // Parse start and end times
      const [startHour, startMinute] = quietHours.start.split(':').map(Number);
      const [endHour, endMinute] = quietHours.end.split(':').map(Number);

      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = endHour * 60 + endMinute;

      // Handle overnight quiet hours (e.g., 22:00 - 08:00)
      if (startTotalMinutes > endTotalMinutes) {
        // Overnight period
        return (
          currentTotalMinutes >= startTotalMinutes ||
          currentTotalMinutes <= endTotalMinutes
        );
      } else {
        // Same day period
        return (
          currentTotalMinutes >= startTotalMinutes &&
          currentTotalMinutes <= endTotalMinutes
        );
      }
    } catch (error) {
      this.logger.warn({ error, quietHours }, 'Failed to check quiet hours');
      return false;
    }
  }

  // ============================================
  // GET ALLOWED CHANNELS FOR NOTIFICATION
  // ============================================

  async getAllowedChannels(
    userId: string,
    category: NotificationCategory,
    requestedChannels: NotificationChannel[],
  ): Promise<NotificationChannel[]> {
    const allowed: NotificationChannel[] = [];

    for (const channel of requestedChannels) {
      const result = await this.isChannelAllowed(userId, category, channel);
      if (result.allowed) {
        allowed.push(channel);
      }
    }

    return allowed;
  }

  // ============================================
  // BULK UPDATE PREFERENCES (All categories)
  // ============================================

  async bulkUpdateChannelPreference(
    userId: string,
    channel: NotificationChannel,
    enabled: boolean,
  ): Promise<number> {
    const allCategories = Object.values(NotificationCategory);
    let updated = 0;

    for (const category of allCategories) {
      const dto: UpdatePreferenceDto = {};

      switch (channel) {
        case NotificationChannel.IN_APP:
          dto.in_app_enabled = enabled;
          break;
        case NotificationChannel.SSE:
          // SSE follows the same preference as IN_APP
          dto.in_app_enabled = enabled;
          break;
        case NotificationChannel.PUSH:
          dto.push_enabled = enabled;
          break;
        case NotificationChannel.EMAIL:
          dto.email_enabled = enabled;
          break;
        case NotificationChannel.SMS:
          dto.sms_enabled = enabled;
          break;
        case NotificationChannel.WHATSAPP:
          dto.whatsapp_enabled = enabled;
          break;
      }

      await this.updatePreference(userId, category, dto);
      updated++;
    }

    this.logger.info({ userId, channel, enabled, updated }, 'Bulk preference updated');
    return updated;
  }

  // ============================================
  // INITIALIZE DEFAULT PREFERENCES FOR USER
  // ============================================

  async initializeDefaultPreferences(userId: string): Promise<void> {
    const allCategories = Object.values(NotificationCategory);

    for (const category of allCategories) {
      await this.getOrCreatePreference(userId, category);
    }

    this.logger.info({ userId }, 'Default preferences initialized');
  }

  // ============================================
  // DELETE ALL PREFERENCES FOR USER
  // ============================================

  async deleteUserPreferences(userId: string): Promise<number> {
    const result = await this.prefRepo.delete({ user_id: userId });
    this.logger.info({ userId, deleted: result.affected }, 'User preferences deleted');
    return result.affected || 0;
  }
}