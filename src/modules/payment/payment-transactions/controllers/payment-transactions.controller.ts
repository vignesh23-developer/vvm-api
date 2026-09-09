import { Controller, Get, Query, UseGuards, Param, Res, ForbiddenException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { Response } from 'express';
import { PaymentTransactionsService } from '../services/payment-transactions.service';
import { InvoiceGeneratorService } from '../services/invoice-generator.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import { UserType } from 'src/modules/users/enums/usertype';

@ApiTags('payment-transactions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('payment-transactions')
export class PaymentTransactionsController {
  constructor(
    private readonly service: PaymentTransactionsService,
    private readonly invoiceGenerator: InvoiceGeneratorService
  ) {}

  @Get('users/transactions')
  @ApiOperation({ summary: "Get current user's payment transactions" })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number (starting from 1)' })
  @ApiQuery({ name: 'limit', required: false, example: 10, description: 'Number of transactions per page (1-50)' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'], description: 'Sort order', example: 'DESC' })
  @ApiQuery({ name: 'orderBy', required: false, description: 'Field to sort by (created_at, updated_at, verified_at, amount, attempt_number, status)', example: 'created_at' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by transaction status' })
  @ApiQuery({ name: 'method', required: false, description: 'Filter by payment method (UPI, CARD, NETBANKING, WALLET, EMI)' })
  @ApiQuery({ name: 'minAmount', required: false, type: Number, description: 'Minimum transaction amount' })
  @ApiQuery({ name: 'maxAmount', required: false, type: Number, description: 'Maximum transaction amount' })
  @ApiQuery({ name: 'currency', required: false, description: 'Filter by currency (default: INR)' })
  @ApiQuery({ name: 'gateway', required: false, description: 'Filter by payment gateway (RAZORPAY, PHONEPE, PAYTM)' })
  @ApiQuery({ name: 'dateFilter', required: false, enum: ['day', 'days', 'month', 'year'], description: 'Date filter type' })
  @ApiQuery({ name: 'dateValue', required: false, type: Number, description: 'Value for date filter (e.g., 7 for days=7, 1-12 for month, YYYY for year)' })
  @ApiQuery({ name: 'dateField', required: false, enum: ['created_at', 'updated_at', 'verified_at'], description: 'Date field to filter by' })
  async getUserTransactions(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('orderBy') orderBy: string = 'created_at',
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('currency') currency?: string,
    @Query('gateway') gateway?: string,
    @Query('dateFilter') dateFilter?: 'day' | 'days' | 'month' | 'year',
    @Query('dateValue') dateValue?: string,
    @Query('dateField') dateField?: 'created_at' | 'updated_at' | 'verified_at',
  ) {
    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const l = Math.max(1, Math.min(parseInt(String(limit), 10) || 10, 50));

    const filters: any = {};
    if (status) filters.status = status;
    if (method) filters.method = method;
    if (minAmount) filters.minAmount = parseFloat(minAmount);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
    if (currency) filters.currency = currency;
    if (gateway) filters.gateway = gateway;
    if (dateFilter) filters.dateFilter = dateFilter;
    if (dateValue) filters.dateValue = parseInt(dateValue, 10);
    if (dateField) filters.dateField = dateField;

    const result = await this.service.findByUserId(user.id, p, l, filters, order, orderBy);
    return { success: true, data: result };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List all payment transactions (Admin sees all, others see only their own)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number (starting from 1)' })
  @ApiQuery({ name: 'limit', required: false, example: 10, description: 'Number of transactions per page (1-50)' })
  @ApiQuery({ name: 'order', required: false, enum: ['ASC', 'DESC'], description: 'Sort order', example: 'DESC' })
  @ApiQuery({ name: 'orderBy', required: false, description: 'Field to sort by (created_at, updated_at, verified_at, amount, attempt_number, status)', example: 'created_at' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by transaction status' })
  @ApiQuery({ name: 'method', required: false, description: 'Filter by payment method (UPI, CARD, NETBANKING, WALLET, EMI)' })
  @ApiQuery({ name: 'minAmount', required: false, type: Number, description: 'Minimum transaction amount' })
  @ApiQuery({ name: 'maxAmount', required: false, type: Number, description: 'Maximum transaction amount' })
  @ApiQuery({ name: 'currency', required: false, description: 'Filter by currency (default: INR)' })
  @ApiQuery({ name: 'gateway', required: false, description: 'Filter by payment gateway (RAZORPAY, PHONEPE, PAYTM)' })
  @ApiQuery({ name: 'dateFilter', required: false, enum: ['day', 'days', 'month', 'year'], description: 'Date filter type' })
  @ApiQuery({ name: 'dateValue', required: false, type: Number, description: 'Value for date filter (e.g., 7 for days=7, 1-12 for month, YYYY for year)' })
  @ApiQuery({ name: 'dateField', required: false, enum: ['created_at', 'updated_at', 'verified_at'], description: 'Date field to filter by' })
  async list(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('orderBy') orderBy: string = 'created_at',
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('currency') currency?: string,
    @Query('gateway') gateway?: string,
    @Query('dateFilter') dateFilter?: 'day' | 'days' | 'month' | 'year',
    @Query('dateValue') dateValue?: string,
    @Query('dateField') dateField?: 'created_at' | 'updated_at' | 'verified_at',
  ) {
    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const l = Math.max(1, Math.min(parseInt(String(limit), 10) || 10, 50));

    const filters: any = {};
    if (status) filters.status = status;
    if (method) filters.method = method;
    if (minAmount) filters.minAmount = parseFloat(minAmount);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
    if (currency) filters.currency = currency;
    if (gateway) filters.gateway = gateway;
    if (dateFilter) filters.dateFilter = dateFilter;
    if (dateValue) filters.dateValue = parseInt(dateValue, 10);
    if (dateField) filters.dateField = dateField;

    return this.service.findAll(
      p,
      l,
      filters,
      order,
      orderBy,
      user.id,
      user.roles
    );
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get payment transaction analytics (counts and growth percentages)' })
  @ApiResponse({
    status: 200,
    description: 'Analytics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        grandTotal: { type: 'number', description: 'Total number of all transactions' },
        today: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of transactions today' },
            growthPercentage: { type: 'number', description: 'Growth percentage compared to yesterday' },
          },
        },
        thisWeek: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of transactions this week' },
            growthPercentage: { type: 'number', description: 'Growth percentage compared to last week' },
          },
        },
        thisMonth: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of transactions this month' },
            growthPercentage: { type: 'number', description: 'Growth percentage compared to last month' },
          },
        },
      },
    },
  })
  async getAnalytics() {
    return this.service.getAnalytics();
  }

  @Get('transactions/:id/invoice')
  @ApiOperation({ summary: 'Generate and download invoice PDF for a payment transaction' })
  @ApiParam({ name: 'id', description: 'Payment transaction ID', example: 'uuid-here' })
  @ApiResponse({
    status: 200,
    description: 'Invoice PDF file',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary'
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Forbidden - User does not have access to this transaction' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getInvoice(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response
  ): Promise<void> {
    // Get transaction with relations
    const transaction = await this.service.findOneWithRelations(id);

    // Authorization check: User must own the transaction OR be an admin
    const isAdmin = user.roles?.includes(UserType.ADMIN);
    const isOwner = transaction.payment_order?.user_id === user.id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You do not have permission to access this invoice');
    }

    // Generate invoice PDF
    const pdfBuffer = await this.invoiceGenerator.generateInvoice({
      transaction,
      paymentOrder: transaction.payment_order,
      user: transaction.payment_order.user
    });

    // Set response headers for PDF download
    const fileName = `invoice-${transaction.payment_order.order_number}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());

    // Send PDF buffer
    res.send(pdfBuffer);
  }
}

