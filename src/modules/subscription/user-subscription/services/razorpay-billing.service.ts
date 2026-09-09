import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { RazorpayService } from '../../../shared/services/payment/razorpay.service';

/**
 * Thin wrapper to keep payment logic in one place.
 * - createOrder: create order with notes metadata
 * - verifyPayment: verify signature and return order details
 * - extractMetadataFromOrder: canonicalize order.notes -> a typed object
 */
@Injectable()
export class RazorpayBillingService {
  constructor(private readonly razorpayService: RazorpayService) {}

  async createOrder(amount: number, currency: string, receipt: string, notes: Record<string, any>) {
    // you already have a createOrder in razorpayService; use it and standardize response
    const order = await this.razorpayService.createOrder(amount, currency, receipt, notes);
    return order;
  }

  /**
   * Verify signature and return the order object (from Razorpay) if valid.
   * Throws UnauthorizedException on invalid signature.
   */
  verifyPayment(dto: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    const isValid = this.razorpayService.verifySignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );
    if (!isValid) throw new UnauthorizedException('Invalid payment signature');
    return this.razorpayService.getOrderById(dto.razorpay_order_id);
  }

  /**
   * Make sure the metadata you expect is present and typed.
   * Example notes expected: { actionType: 'upgrade_prorated', userId: '...', oldPlanId: '...', newPlanId: '...' }
   */
  extractMetadataFromOrder(order: any) {
    const notes = order?.notes || {};
    // canonicalize numeric IDs to numbers
    const meta: any = { ...notes };
    if (meta.plan_id) meta.plan_id = Number(meta.plan_id);
    if (meta.newPlanId) meta.newPlanId = Number(meta.newPlanId);
    if (meta.oldPlanId) meta.oldPlanId = Number(meta.oldPlanId);
    // userId might be string
    return meta;
  }
}
