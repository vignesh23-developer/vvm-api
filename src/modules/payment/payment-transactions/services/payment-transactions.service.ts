import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PaymentTransaction } from '../../entities/payment-transactions.entity';
import {
  CreatePaymentTransactionDto,
  VerifyPaymentTransactionDto,
  UpdatePaymentTransactionDto,
} from '../dto/payment-transactions.dto';
import { UserType } from 'src/modules/users/enums/usertype';

@Injectable()
export class PaymentTransactionsService {
  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly paymentTransactionRepo: Repository<PaymentTransaction>,
  ) {}

  /**
   * Find transaction by ID
   */
  async findOne(id: string): Promise<PaymentTransaction> {
    const transaction = await this.paymentTransactionRepo.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('Payment transaction not found');
    return transaction;
  }

  /**
   * Find transaction by ID with relations (for invoice generation)
   */
  async findOneWithRelations(id: string): Promise<PaymentTransaction> {
    const transaction = await this.paymentTransactionRepo.findOne({
      where: { id },
      relations: ['payment_order', 'payment_order.user']
    });
    if (!transaction) throw new NotFoundException('Payment transaction not found');
    return transaction;
  }

  /**
   * Find Transactions by UserId with pagination, filtering, and sorting
   */
  async findByUserId(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      method?: string;
      minAmount?: number;
      maxAmount?: number;
      currency?: string;
      gateway?: string;
      dateFilter?: 'day' | 'days' | 'month' | 'year';
      dateValue?: number;
      dateField?: 'created_at' | 'updated_at' | 'verified_at';
    },
    order: 'ASC' | 'DESC' = 'DESC',
    orderBy: string = 'created_at',
  ): Promise<{ data: PaymentTransaction[]; total: number; page: number; limit: number }> {
    const qb = this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .leftJoinAndSelect('pt.payment_order', 'po')
      .where('po.user_id = :userId', { userId });

    // Apply filters
    if (filters?.status) {
      qb.andWhere('pt.status = :status', { status: filters.status });
    }

    if (filters?.method) {
      qb.andWhere('pt.method = :method', { method: filters.method });
    }

    if (filters?.minAmount !== undefined) {
      qb.andWhere('pt.amount >= :minAmount', { minAmount: filters.minAmount });
    }

    if (filters?.maxAmount !== undefined) {
      qb.andWhere('pt.amount <= :maxAmount', { maxAmount: filters.maxAmount });
    }

    if (filters?.currency) {
      qb.andWhere('pt.currency = :currency', { currency: filters.currency });
    }

    if (filters?.gateway) {
      qb.andWhere('po.gateway = :gateway', { gateway: filters.gateway });
    }

    // Date filtering
    if (filters?.dateFilter && filters?.dateField) {
      const dateField = `pt.${filters.dateField}`;
      const now = new Date();
      let startDate: Date;

      switch (filters.dateFilter) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          qb.andWhere(`${dateField} >= :startDate`, { startDate });
          break;
        case 'days':
          const daysValue = filters.dateValue || 7;
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - daysValue);
          qb.andWhere(`${dateField} >= :startDate`, { startDate });
          break;
        case 'month':
          const monthValue = filters.dateValue !== undefined ? filters.dateValue - 1 : now.getMonth();
          startDate = new Date(now.getFullYear(), monthValue, 1);
          const endDate = new Date(now.getFullYear(), monthValue + 1, 0, 23, 59, 59, 999);
          qb.andWhere(`${dateField} >= :startDate AND ${dateField} <= :endDate`, { startDate, endDate });
          break;
        case 'year':
          const yearValue = filters.dateValue || now.getFullYear();
          startDate = new Date(yearValue, 0, 1);
          const yearEndDate = new Date(yearValue, 11, 31, 23, 59, 59, 999);
          qb.andWhere(`${dateField} >= :startDate AND ${dateField} <= :endDate`, { startDate, endDate: yearEndDate });
          break;
      }
    }

    // Validate and apply ordering
    const validOrderFields = ['created_at', 'updated_at', 'verified_at', 'amount', 'attempt_number', 'status'];
    const sortField = validOrderFields.includes(orderBy) ? `pt.${orderBy}` : 'pt.created_at';
    qb.orderBy(sortField, order);

    // Apply pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    // Execute query
    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * Find all transactions with pagination, filtering, and sorting
   * Admin sees all transactions, non-admins see only their own
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: string;
      method?: string;
      minAmount?: number;
      maxAmount?: number;
      currency?: string;
      gateway?: string;
      dateFilter?: 'day' | 'days' | 'month' | 'year';
      dateValue?: number;
      dateField?: 'created_at' | 'updated_at' | 'verified_at';
    },
    order: 'ASC' | 'DESC' = 'DESC',
    orderBy: string = 'created_at',
    userId?: string,
    userRoles?: string[]
  ): Promise<{ data: PaymentTransaction[]; total: number; page: number; limit: number }> {
    const qb = this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .leftJoinAndSelect('pt.payment_order', 'po');

    // Filter by userId if not admin
    if (!userRoles?.includes(UserType.ADMIN)) {
      if (userId) {
        qb.where('po.user_id = :userId', { userId });
      } else {
        // If no userId and not admin, return empty result
        return { data: [], total: 0, page, limit };
      }
    }

    // Apply filters
    if (filters?.status) {
      qb.andWhere('pt.status = :status', { status: filters.status });
    }

    if (filters?.method) {
      qb.andWhere('pt.method = :method', { method: filters.method });
    }

    if (filters?.minAmount !== undefined) {
      qb.andWhere('pt.amount >= :minAmount', { minAmount: filters.minAmount });
    }

    if (filters?.maxAmount !== undefined) {
      qb.andWhere('pt.amount <= :maxAmount', { maxAmount: filters.maxAmount });
    }

    if (filters?.currency) {
      qb.andWhere('pt.currency = :currency', { currency: filters.currency });
    }

    if (filters?.gateway) {
      qb.andWhere('po.gateway = :gateway', { gateway: filters.gateway });
    }

    // Date filtering
    if (filters?.dateFilter && filters?.dateField) {
      const dateField = `pt.${filters.dateField}`;
      const now = new Date();
      let startDate: Date;

      switch (filters.dateFilter) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          qb.andWhere(`${dateField} >= :startDate`, { startDate });
          break;
        case 'days':
          const daysValue = filters.dateValue || 7;
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - daysValue);
          qb.andWhere(`${dateField} >= :startDate`, { startDate });
          break;
        case 'month':
          const monthValue = filters.dateValue !== undefined ? filters.dateValue - 1 : now.getMonth();
          startDate = new Date(now.getFullYear(), monthValue, 1);
          const endDate = new Date(now.getFullYear(), monthValue + 1, 0, 23, 59, 59, 999);
          qb.andWhere(`${dateField} >= :startDate AND ${dateField} <= :endDate`, { startDate, endDate });
          break;
        case 'year':
          const yearValue = filters.dateValue || now.getFullYear();
          startDate = new Date(yearValue, 0, 1);
          const yearEndDate = new Date(yearValue, 11, 31, 23, 59, 59, 999);
          qb.andWhere(`${dateField} >= :startDate AND ${dateField} <= :endDate`, { startDate, endDate: yearEndDate });
          break;
      }
    }

    // Validate and apply ordering
    const validOrderFields = ['created_at', 'updated_at', 'verified_at', 'amount', 'attempt_number', 'status'];
    const sortField = validOrderFields.includes(orderBy) ? `pt.${orderBy}` : 'pt.created_at';
    qb.orderBy(sortField, order);

    // Apply pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    // Execute query
    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * Find transactions by payment order ID
   */
  async findByPaymentOrderId(paymentOrderId: string): Promise<PaymentTransaction[]> {
    return this.paymentTransactionRepo.find({
      where: { payment_order_id: paymentOrderId },
      order: { attempt_number: 'ASC' },
    });
  }

  /**
   * Find transaction by gateway payment ID
   */
  async findByGatewayPaymentId(gatewayPaymentId: string): Promise<PaymentTransaction | null> {
    return this.paymentTransactionRepo.findOne({ where: { gateway_payment_id: gatewayPaymentId } });
  }

  /**
   * Find transactions by status
   */
  async findByStatus(status: string): Promise<PaymentTransaction[]> {
    return this.paymentTransactionRepo.find({ where: { status } });
  }

  /**
   * Create a new payment transaction
   */
  async create(dto: CreatePaymentTransactionDto): Promise<PaymentTransaction> {
    const entity = this.paymentTransactionRepo.create(dto as any);
    const saved = await this.paymentTransactionRepo.save(entity);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  /**
   * Update payment transaction
   */
  async update(id: string, dto: UpdatePaymentTransactionDto): Promise<PaymentTransaction> {
    await this.findOne(id); // Ensure exists
    await this.paymentTransactionRepo.update(id, dto as any);
    return this.findOne(id);
  }

  /**
   * Update transaction status (e.g., for late authorization)
   */
  async updateStatus(id: string, status: string, verifiedAt?: Date): Promise<PaymentTransaction> {
    const updateDto: UpdatePaymentTransactionDto = { status };
    if (verifiedAt) updateDto.verified_at = verifiedAt;
    return this.update(id, updateDto);
  }

  /**
   * Get next attempt number for a payment order
   */
  async getNextAttemptNumber(paymentOrderId: string): Promise<number> {
    const transactions = await this.findByPaymentOrderId(paymentOrderId);
    if (transactions.length === 0) return 1;
    const maxAttempt = Math.max(...transactions.map(t => t.attempt_number));
    return maxAttempt + 1;
  }

  /**
   * Get analytics for payment transactions
   * Returns counts and growth percentages for different time periods
   */
  async getAnalytics(): Promise<{
    grandTotal: number;
    today: { count: number; growthPercentage: number };
    thisWeek: { count: number; growthPercentage: number };
    thisMonth: { count: number; growthPercentage: number };
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Previous periods for growth calculation
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);
    
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Grand total (all time)
    const grandTotal = await this.paymentTransactionRepo.count();

    // Today's count
    const todayCount = await this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .where('pt.created_at >= :todayStart', { todayStart })
      .getCount();

    // Yesterday's count (for growth calculation)
    const yesterdayCount = await this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .where('pt.created_at >= :yesterdayStart', { yesterdayStart })
      .andWhere('pt.created_at < :yesterdayEnd', { yesterdayEnd })
      .getCount();

    // This week's count
    const thisWeekCount = await this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .where('pt.created_at >= :weekStart', { weekStart })
      .getCount();

    // Last week's count (for growth calculation)
    const lastWeekCount = await this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .where('pt.created_at >= :lastWeekStart', { lastWeekStart })
      .andWhere('pt.created_at < :lastWeekEnd', { lastWeekEnd })
      .getCount();

    // This month's count
    const thisMonthCount = await this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .where('pt.created_at >= :monthStart', { monthStart })
      .getCount();

    // Last month's count (for growth calculation)
    const lastMonthCount = await this.paymentTransactionRepo
      .createQueryBuilder('pt')
      .where('pt.created_at >= :lastMonthStart', { lastMonthStart })
      .andWhere('pt.created_at <= :lastMonthEnd', { lastMonthEnd })
      .getCount();

    // Calculate growth percentages
    const calculateGrowth = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      grandTotal,
      today: {
        count: todayCount,
        growthPercentage: calculateGrowth(todayCount, yesterdayCount),
      },
      thisWeek: {
        count: thisWeekCount,
        growthPercentage: calculateGrowth(thisWeekCount, lastWeekCount),
      },
      thisMonth: {
        count: thisMonthCount,
        growthPercentage: calculateGrowth(thisMonthCount, lastMonthCount),
      },
    };
  }
}

