import {
  Controller,
  Get,
  Body,
  Patch,
  Request,
  UseGuards,
  Post,
  Delete,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Query
} from '@nestjs/common';
import { ProfileService } from './services/profile.service';
import {
  ProfileResponseDto,
  UpdateProfileDto,
  LoginHistoryItemDto
} from './dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { UploadedFile } from '../../property/property-media/types/uploaded-file';
import { UserType } from '../enums/usertype';
import { UserListItemDto } from './dto/user-list-item.dto';
import {
  UpdatePasswordDto,
  UpdatePasswordResponseDto
} from './dto/change-password.dto';

@ApiTags('Profile')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @ApiOperation({
    summary: 'Get user profile',
    description:
      "Retrieves the authenticated user's profile information including roles and account details"
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the user profile information',
    type: ProfileResponseDto,
    example: {
      id: '123e4567-e89b-12d3-a456-426614174000'
    }
  })
  @Get()
  getProfile(@CurrentUser() user: any): Promise<ProfileResponseDto> {
    return this.profileService.getProfile(
      user.id
    ) as unknown as Promise<ProfileResponseDto>;
  }

  @ApiBody({
    type: UpdateProfileDto,
    description: 'Profile data to update',
    examples: {
      updateFirstName: {
        summary: 'Update first name only',
        value: {
          firstName: 'John'
        }
      },
      updateLastName: {
        summary: 'Update last name only',
        value: {
          lastName: 'Smith'
        }
      },
      updatePhone: {
        summary: 'Update phone number',
        value: {
          phoneNumber: '+919876543210'
        }
      },
      updateEmail: {
        summary: 'Update email',
        value: {
          email: 'john.smith@example.com'
        }
      },
      updateMultiple: {
        summary: 'Update multiple fields',
        value: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          phoneNumber: '+919876543210'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Profile has been successfully updated',
    type: ProfileResponseDto,
    example: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'john.smith@example.com',
      firstName: 'John',
      lastName: 'Smith',
      phoneNumber: '+919876543210',
      isActive: true,
      roles: ['BUYER'],
      profilePicture: null,
      isEmailVerified: false,
      isPhoneVerified: true,
      isKycVerified: false,
      referralCode: 'ABC12345',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-12-12T10:30:00.000Z'
    }
  })
  @Patch()
  updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto
  ): Promise<ProfileResponseDto> {
    return this.profileService.updateProfile(
      req.user.id,
      updateProfileDto
    ) as unknown as Promise<ProfileResponseDto>;
  }

  @ApiOperation({
    summary: 'Get user login history',
    description:
      "Retrieves the authenticated user's login history including IP addresses and timestamps"
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the user login history',
    type: 'array',
    example: {
      loginHistory: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          ipAddress: '192.168.1.1',
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          loginAt: '2024-01-01T10:30:00.000Z'
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          ipAddress: '192.168.1.2',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          loginAt: '2024-01-01T08:15:00.000Z'
        }
      ]
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token'
  })
  @Get('login-history')
  getLoginHistory(@Request() req): Promise<LoginHistoryItemDto[]> {
    return this.profileService.getLoginHistory(req.user.id).then((history) =>
      history.map((h) => ({
        id: h.id,
        // Normalize nullable columns to satisfy DTO non-nullable types
        ipAddress: h.ipAddress ?? '',
        userAgent: h.userAgent ?? '',
        loginAt: h.loginAt
      }))
    );
  }

  @Post('picture')
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Profile picture file (jpeg, png, gif, webp - max 5MB)'
        }
      },
      required: ['file']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Profile picture uploaded successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @UseInterceptors(FilesInterceptor('file', 1))
  async uploadProfilePicture(
    @CurrentUser() user: any,
    @UploadedFiles() files: UploadedFile[]
  ): Promise<ProfileResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No file uploaded');
    }

    const profile = await this.profileService.uploadProfilePicture(
      user.id,
      files[0]
    );
    return profile as ProfileResponseDto;
  }

  @Delete('picture')
  @ApiOperation({ summary: 'Delete profile picture' })
  @ApiResponse({
    status: 200,
    description: 'Profile picture deleted successfully'
  })
  @ApiResponse({ status: 400, description: 'No profile picture to delete' })
  async deleteProfilePicture(
    @CurrentUser() user: any
  ): Promise<ProfileResponseDto> {
    const profile = await this.profileService.deleteProfilePicture(user.id);
    return profile as ProfileResponseDto;
  }

  @Get('referral')
  @ApiOperation({
    summary: 'Get referral information',
    description:
      'Get your referral code and list of users you have referred with pagination'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)'
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort order (default: DESC)'
  })
  @ApiQuery({
    name: 'orderBy',
    required: false,
    type: String,
    description: 'Field to sort by (default: createdAt)'
  })
  @ApiResponse({
    status: 200,
    description: 'Returns referral information with pagination'
  })
  async getReferralInfo(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sort') sort?: string,
    @Query('orderBy') orderBy?: string
  ) {
    return this.profileService.getReferralInfo(
      user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      sort || 'DESC',
      orderBy || 'createdAt'
    );
  }

  @Get('referral/analytics')
  @ApiOperation({
    summary: 'Get referral analytics',
    description:
      'Get referral statistics (counts and earnings) for today, week, month, year, and total'
  })
  @ApiResponse({ status: 200, description: 'Returns referral analytics' })
  async getReferralAnalytics(@CurrentUser() user: any) {
    return this.profileService.getReferralAnalytics(user.id);
  }

  @Get('users')
  @ApiOperation({
    summary: 'List all users',
    description:
      'Returns users with pagination. Optionally filters to active users only.'
  })
  @ApiQuery({
    name: 'activeOnly',
    required: false,
    type: Boolean,
    example: true,
    description: 'If true, returns only active users (default: true)'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (default: 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page (default: 10, max: 50, 0 for all)'
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by name, email, or phone'
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: UserType,
    description: 'Filter by role'
  })
  @ApiResponse({
    status: 200,
    description: 'Array of users with pagination',
    example: {
      data: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          googleId: null,
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+919876543210',
          isActive: true,
          referralCode: 'ABC12345',
          referredBy: null,
          roles: ['BUYER'],
          isKycVerified: false,
          kycVerifiedAt: null,
          aadhaarNumberMasked: null,
          profilePicture: 'https://s3.amazonaws.com/...',
          isEmailVerified: true,
          isPhoneVerified: true,
          emailVerifiedAt: '2024-01-15T10:30:00.000Z',
          phoneVerifiedAt: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z',
          hasPassword: true
        }
      ],
      total: 100,
      page: 1,
      limit: 10
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  list(
    @Query('activeOnly') activeOnly?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Query('role') role?: UserType
  ): Promise<{
    data: UserListItemDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const flag = activeOnly === undefined ? true : activeOnly === 'true';
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l =
      parseInt(limit, 10) <= 0 ? 0 : Math.min(parseInt(limit, 10) || 10, 50);
    return this.profileService.findAll(flag, p, l, search, role);
  }

  @Post('update-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update password',
    description:
      'Set or change password. If user has existing password, currentPassword is required.'
  })
  @ApiBody({
    type: UpdatePasswordDto,
    examples: {
      setPassword: {
        summary: 'Set password (Google OAuth user - no existing password)',
        value: {
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!'
        }
      },
      changePassword: {
        summary: 'Change password (user with existing password)',
        value: {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Password updated successfully',
    type: UpdatePasswordResponseDto,
    example: {
      success: true,
      message: 'Password updated successfully'
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or current password required'
  })
  @ApiResponse({
    status: 401,
    description: 'Current password incorrect or unauthorized'
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updatePassword(
    @CurrentUser() user: any,
    @Body() dto: UpdatePasswordDto
  ): Promise<UpdatePasswordResponseDto> {
    return this.profileService.updatePassword(user.id, dto);
  }
}
