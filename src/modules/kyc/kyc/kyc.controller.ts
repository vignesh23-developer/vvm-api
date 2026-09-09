import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { Request } from 'express';
import { KycService } from './services/kyc.service';
import {
  InitiateKycDto,
  InitiateKycResponseDto,
  CompleteKycDto,
  CompleteKycResponseDto,
  KycStatusResponseDto,
  KycStatsResponseDto,
  MyKycStatusResponseDto,
  PaginatedKycResponseDto,
  GetVerificationsQueryDto
} from './dto';
import { KycStatus, VerificationType, KycEntityType } from '../enums';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, Roles, RolesGuard } from '../../auth';
import { PaymentOrder } from 'src/modules/payment/entities/payment-orders.entity';
import { VerifyPaymentDto } from 'src/modules/subscription/user-subscription/dto/user-subscription.dto';

@ApiTags('KYC')
@Controller('kyc')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  // ============================================================
  // USER ENDPOINTS
  // ============================================================

  @Post('initiate-order')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Initiate KYC order',
    description: 'Initiate KYC order and return order details'
  })
  @ApiResponse({
    status: 201,
    description: 'KYC order initiated successfully',
    type: PaymentOrder
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async initiateKycOrder(
    @CurrentUser() user: any,
    @Body() dto: InitiateKycDto,
    @Req() req: any
  ): Promise<any> {
    const ipAddress = this.getClientIp(req);
    const userAgent = req.headers['user-agent'];
    return this.kycService.initiateKycOrder(user.id, dto.redirectUrl, {
      ipAddress,
      userAgent
    });
  }

  @Post('verify-order')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Verify KYC order',
    description: 'Verify KYC order and return order details'
  })
  @ApiResponse({
    status: 200,
    description: 'KYC order verified successfully',
    type: PaymentOrder
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async verifyKycOrder(
    @CurrentUser() user: any,
    @Body() dto: VerifyPaymentDto,
    @Req() req: any
  ): Promise<InitiateKycResponseDto> {
    return this.kycService.verifyKycOrder(dto);
  }

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Initiate KYC verification',
    description:
      'Start Aadhaar verification via Digilocker. Returns URL to redirect user.'
  })
  @ApiResponse({
    status: 201,
    description: 'Verification initiated successfully',
    type: InitiateKycResponseDto
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Already verified' })
  async initiateKyc(
    @CurrentUser() user: any,
    @Body() dto: InitiateKycDto,
    @Req() req: any
  ): Promise<InitiateKycResponseDto> {
    const ipAddress = this.getClientIp(req);
    const userAgent = req.headers['user-agent'];
    const directCall = dto.directCall;
    return this.kycService.initiateKyc(
      user.id,
      dto,
      ipAddress,
      userAgent,
      directCall
    );
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete KYC verification',
    description:
      'Called after user completes Digilocker verification. Downloads and stores Aadhaar details.'
  })
  @ApiResponse({
    status: 200,
    description: 'Verification completed successfully',
    type: CompleteKycResponseDto
  })
  @ApiResponse({ status: 400, description: 'Verification failed or expired' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
  async completeKyc(
    @CurrentUser() user: any,
    @Body() dto: CompleteKycDto
  ): Promise<CompleteKycResponseDto> {
    return this.kycService.completeKyc(user.id, dto);
  }

  @Post('test/notification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test KYC notification',
    description: 'Test KYC notification for the authenticated user'
  })
  @ApiResponse({
    status: 200,
    description: 'KYC notification sent successfully',
    type: CompleteKycResponseDto
  })
  @ApiResponse({ status: 400, description: 'Verification failed or expired' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
  async testKycNotification(@CurrentUser() user: any) {
    const result = await this.kycService.testKycNotification(user);
    return result;
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get my KYC status',
    description:
      'Returns current KYC verification status for the authenticated user'
  })
  @ApiResponse({
    status: 200,
    description: 'KYC status retrieved',
    type: MyKycStatusResponseDto
  })
  async getMyKycStatus(
    @CurrentUser() user: any
  ): Promise<MyKycStatusResponseDto> {
    return this.kycService.getMyKycStatus(user.id);
  }

  @Get('verifications')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get all my verifications',
    description:
      'Returns list of all verification attempts for the authenticated user'
  })
  @ApiResponse({
    status: 200,
    description: 'Verifications list retrieved',
    type: [KycStatusResponseDto]
  })
  async getMyVerifications(
    @CurrentUser() user: any
  ): Promise<KycStatusResponseDto[]> {
    return this.kycService.getMyVerifications(user.id);
  }

  @Get('verifications/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get verification by ID',
    description: 'Returns details of a specific verification attempt'
  })
  @ApiParam({ name: 'id', description: 'Verification ID' })
  @ApiResponse({
    status: 200,
    description: 'Verification details retrieved',
    type: KycStatusResponseDto
  })
  @ApiResponse({ status: 404, description: 'Verification not found' })
  async getVerificationById(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<KycStatusResponseDto> {
    return this.kycService.getVerificationById(id, user.id);
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get KYC statistics (Admin)',
    description: 'Returns KYC verification statistics'
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved',
    type: KycStatsResponseDto
  })
  async getKycStats(): Promise<KycStatsResponseDto> {
    return this.kycService.getKycStats();
  }

  @Get('admin/verifications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get all verifications (Admin)',
    description:
      'Returns paginated list of all verifications with optional filters'
  })
  @ApiQuery({ name: 'status', enum: KycStatus, required: false })
  @ApiQuery({
    name: 'verificationType',
    enum: VerificationType,
    required: false
  })
  @ApiQuery({ name: 'entityType', enum: KycEntityType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: 'Verifications list retrieved',
    type: PaginatedKycResponseDto
  })
  async getAllVerifications(
    @Query() query: GetVerificationsQueryDto
  ): Promise<PaginatedKycResponseDto> {
    const { status, verificationType, entityType, page, limit } = query;
    return this.kycService.getAllVerifications(
      { status, verificationType, entityType },
      page || 1,
      limit || 20
    );
  }

  @Get('admin/verifications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get verification details (Admin)',
    description: 'Returns full verification details including raw responses'
  })
  @ApiParam({ name: 'id', description: 'Verification ID' })
  @ApiResponse({ status: 200, description: 'Verification details retrieved' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
  async getVerificationByIdAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.kycService.getVerificationByIdAdmin(id);
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return req.ip || req.socket?.remoteAddress || '';
  }
}
