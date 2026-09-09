import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KycService } from '../kyc/services/kyc.service';

@Injectable()
export class KycScheduler {
  private readonly logger = new Logger(KycScheduler.name);

  constructor(private readonly kycService: KycService) {}

  @Cron(CronExpression.EVERY_2_HOURS)
  async handleExpireOldVerifications(): Promise<void> {
    try {
      const count = await this.kycService.expireOldVerifications();
      if (count > 0) {
        this.logger.log(`Scheduler: Expired ${count} pending verifications`);
      }
    } catch (error) {
      this.logger.error('Scheduler: Failed to expire old verifications', error);
    }
  }
}