import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentProfileInfoDto } from './agent-profile-info.dto';

export class UserInfoDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  email?: string;

  @ApiProperty({ example: '+919884562624' })
  phoneNumber: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiPropertyOptional({ example: 'Doe' })
  lastName?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ type: [String], example: ['BUYER', 'AGENT'] })
  roles: string[];

  // Verification Status - NEW
  @ApiProperty({ example: false })
  isEmailVerified: boolean;

  @ApiProperty({ example: true })
  isPhoneVerified: boolean;

  @ApiProperty({ example: false })
  isKycVerified: boolean;

  // Profile Picture - NEW
  @ApiPropertyOptional({ example: 'https://s3.amazonaws.com/bucket/users/123/profile.jpg' })
  profilePicture?: string;

  // Referral - NEW
  @ApiPropertyOptional({ example: 'ABC12345' })
  referralCode?: string;

  // Agent Profile
  @ApiPropertyOptional({ type: AgentProfileInfoDto })
  agent?: AgentProfileInfoDto;
}