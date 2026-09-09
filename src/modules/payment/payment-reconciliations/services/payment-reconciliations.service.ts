import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentReconciliation } from '../../entities/payment-reconciliations.entity';
import {
  CreatePaymentReconciliationDto,
  UpdatePaymentReconciliationDto,
} from '../dto/payment-reconciliations.dto';

@Injectable()
export class PaymentReconciliationsService {
  constructor(
    @InjectRepository(PaymentReconciliation)
    private readonly paymentReconciliationRepo: Repository<PaymentReconciliation>,
  ) {}

  /**
   * Create reconciliation record for late authorization
   */
  async createLateAuthorization(dto: CreatePaymentReconciliationDto): Promise<PaymentReconciliation> {
    // TODO: Create reconciliation with type='LATE_AUTHORIZATION', status='PENDING' using dto
    // TODO: Save and return
    throw new Error('Method not implemented');
  }

  /**
   * Create reconciliation record for refund
   */
  async createRefund(dto: CreatePaymentReconciliationDto): Promise<PaymentReconciliation> {
    // TODO: Create reconciliation with type='REFUND' or 'PARTIAL_REFUND', status='PENDING' using dto
    // TODO: Save and return
    throw new Error('Method not implemented');
  }

  /**
   * Create reconciliation record for chargeback
   */
  async createChargeback(dto: CreatePaymentReconciliationDto): Promise<PaymentReconciliation> {
    // TODO: Create reconciliation with type='CHARGEBACK', status='PENDING' using dto
    // TODO: Save and return
    throw new Error('Method not implemented');
  }

  /**
   * Process reconciliation (update status to PROCESSED)
   */
  async processReconciliation(id: string, processedAt?: Date): Promise<PaymentReconciliation> {
    const updateDto: UpdatePaymentReconciliationDto = { status: 'PROCESSED' };
    if (processedAt) updateDto.processed_at = processedAt;
    return this.update(id, updateDto);
  }

  /**
   * Find reconciliation by ID
   */
  async findOne(id: string): Promise<PaymentReconciliation> {
    const reconciliation = await this.paymentReconciliationRepo.findOne({ where: { id } });
    if (!reconciliation) throw new NotFoundException('Payment reconciliation not found');
    return reconciliation;
  }

  /**
   * Find reconciliations by payment transaction ID
   */
  async findByTransactionId(paymentTransactionId: string): Promise<PaymentReconciliation[]> {
    return this.paymentReconciliationRepo.find({
      where: { payment_transaction_id: paymentTransactionId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Find reconciliation by gateway event ID
   */
  async findByGatewayEventId(gatewayEventId: string): Promise<PaymentReconciliation | null> {
    return this.paymentReconciliationRepo.findOne({ where: { gateway_event_id: gatewayEventId } });
  }

  /**
   * Find reconciliations by type and status
   */
  async findByTypeAndStatus(type: string, status: string): Promise<PaymentReconciliation[]> {
    return this.paymentReconciliationRepo.find({ where: { type, status } });
  }

  /**
   * Create a new payment reconciliation
   */
  async create(dto: CreatePaymentReconciliationDto): Promise<PaymentReconciliation> {
    const entity = this.paymentReconciliationRepo.create(dto as any);
    const saved = await this.paymentReconciliationRepo.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  /**
   * Update payment reconciliation
   */
  async update(id: string, dto: UpdatePaymentReconciliationDto): Promise<PaymentReconciliation> {
    await this.findOne(id); // Ensure exists
    await this.paymentReconciliationRepo.update(id, dto as any);
    return this.findOne(id);
  }
}

