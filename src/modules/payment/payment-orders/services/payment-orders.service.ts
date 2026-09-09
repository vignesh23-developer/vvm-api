import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentOrder } from '../../entities/payment-orders.entity';
import { CreatePaymentOrderFromRazorpayDto } from '../dto/payment-orders.dto';

@Injectable()
export class PaymentOrdersService {
  constructor(
    @InjectRepository(PaymentOrder)
    private readonly paymentOrderRepo: Repository<PaymentOrder>,
  ) {}

  /**
   * Create payment order from Razorpay order details
   * Extracts payment details from the Razorpay order object
   * Called after Razorpay order is created (for subscription, upgrade, downgrade, addon, etc.)
   */
  async createFromRazorpayOrder(
    razorpayOrder: any,
    dto: CreatePaymentOrderFromRazorpayDto,
  ): Promise<PaymentOrder> {
    // Generate order number (VVM-PAY-YYYYMMDD-XXXXX)
    const orderNumber = this.generateOrderNumber();

    // Extract amount from Razorpay order (Razorpay stores amount in paise, convert to rupees)
    const razorpayAmount = razorpayOrder.amount ? razorpayOrder.amount / 100 : dto.payable_amount;

    // Calculate tax if not provided
    const taxAmount = dto.tax_amount || (dto.base_amount * dto.tax_percent) / 100;
    const subtotal = dto.subtotal || dto.base_amount + taxAmount;

    // Create payment order entity
    const entity = this.paymentOrderRepo.create({
      order_number: orderNumber,
      user_id: dto.user_id,
      gateway: 'RAZORPAY',
      gateway_order_id: dto.gateway_order_id,
      channel: dto.channel,
      purpose: dto.purpose,
      related_entity_type: dto.related_entity_type || null,
      related_entity_id: dto.related_entity_id || null,
      currency: 'INR',
      base_amount: dto.base_amount,
      tax_percent: dto.tax_percent,
      tax_amount: taxAmount,
      subtotal: subtotal,
      discount_amount: dto.discount_amount || 0,
      wallet_amount_used: dto.wallet_amount_used || 0,
      payable_amount: dto.payable_amount,
      promo_code: dto.promo_code || null,
      status: 'CREATED',
      notes: dto.notes || razorpayOrder.notes || null,
      ip_address: dto.ip_address || null,
      user_agent: dto.user_agent || null,
      expires_at: dto.expires_at || this.getDefaultExpiry(),
    } as any);

    const saved = await this.paymentOrderRepo.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  /**
   * Generate order number in format: VVM-PAY-YYYYMMDD-XXXXX
   */
  private generateOrderNumber(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `VVM-PAY-${dateStr}-${randomStr}`;
  }

  /**
   * Get default expiry time (15-30 minutes from now)
   */
  private getDefaultExpiry(): Date {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 15); // Default 15 minutes
    return expiry;
  }

  /**
   * Find payment order by ID
   */
  async findOne(id: string): Promise<PaymentOrder> {
    const order = await this.paymentOrderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Payment order not found');
    return order;
  }

  /**
   * Find payment order by order number
   */
  async findByOrderNumber(orderNumber: string): Promise<PaymentOrder | null> {
    return this.paymentOrderRepo.findOne({ where: { order_number: orderNumber } });
  }

  /**
   * Find payment order by gateway order ID
   */
  async findByGatewayOrderId(gatewayOrderId: string): Promise<PaymentOrder | null> {
    return this.paymentOrderRepo.findOne({ where: { gateway_order_id: gatewayOrderId } });
  }

  /**
   * Find payment orders by user ID
   */
  async findByUserId(userId: string, filters?: { status?: string }): Promise<PaymentOrder[]> {
    const where: any = { user_id: userId };
    if (filters?.status) where.status = filters.status;
    return this.paymentOrderRepo.find({ where, order: { created_at: 'DESC' } });
  }

  /**
   * Create a new payment order
   */
  async create(data: Partial<PaymentOrder>): Promise<PaymentOrder> {
    const entity = this.paymentOrderRepo.create(data as any);
    const saved = await this.paymentOrderRepo.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  /**
   * Update payment order
   */
  async update(id: string, data: Partial<PaymentOrder>): Promise<PaymentOrder> {
    await this.findOne(id); // Ensure exists
    await this.paymentOrderRepo.update(id, data as any);
    return this.findOne(id);
  }

  /**
   * Update payment order status
   */
  async updateStatus(id: string, status: string, completedAt?: Date): Promise<PaymentOrder> {
    const updateData: any = { status };
    if (completedAt) updateData.completed_at = completedAt;
    return this.update(id, updateData);
  }

  /**
   * Update gateway order ID after gateway order creation
   */
  async updateGatewayOrderId(id: string, gatewayOrderId: string): Promise<PaymentOrder> {
    return this.update(id, { gateway_order_id: gatewayOrderId, status: 'PROCESSING' } as any);
  }
}
