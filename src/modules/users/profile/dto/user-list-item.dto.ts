import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserType } from '../../enums/usertype';


export class UserListItemDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiPropertyOptional({ example: 'google-oauth2|123456789' })
  googleId?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  email?: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiPropertyOptional({ example: 'Doe' })
  lastName?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  phoneNumber?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: 'ABC12345' })
  referralCode?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  referredBy?: string;

  @ApiProperty({ example: ['BUYER'], enum: UserType, isArray: true })
  roles: UserType[];

  @ApiProperty({ example: false })
  isKycVerified: boolean;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  kycVerifiedAt?: Date;

  @ApiPropertyOptional({ example: 'XXXX-XXXX-1234' })
  aadhaarNumberMasked?: string;

  @ApiPropertyOptional({ example: 'https://s3.amazonaws.com/bucket/users/123/profile.jpg' })
  profilePicture?: string;

  @ApiProperty({ example: false })
  isEmailVerified: boolean;

  @ApiProperty({ example: true })
  isPhoneVerified: boolean;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  emailVerifiedAt?: Date;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  phoneVerifiedAt?: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: true, description: 'Whether user has a password set' })
  hasPassword: boolean;
}