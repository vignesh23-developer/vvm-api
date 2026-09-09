import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

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

  @ApiProperty({ example: ['BUYER'], type: [String] })
  roles: string[];

  @ApiPropertyOptional({ example: 'https://s3.amazonaws.com/bucket/users/123/profile.jpg' })
  profilePicture?: string;

  @ApiPropertyOptional({ example: 'ABC12345' })
  referralCode?: string;

  @ApiProperty({ example: false })
  isEmailVerified: boolean;

  @ApiProperty({ example: true })
  isPhoneVerified: boolean;

  @ApiProperty({ example: false })
  isKycVerified: boolean;

  @ApiPropertyOptional({ example: 'XXXX-XXXX-1234' })
  aadhaarNumberMasked?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-12-12T10:30:00.000Z' })
  updatedAt: Date;
}