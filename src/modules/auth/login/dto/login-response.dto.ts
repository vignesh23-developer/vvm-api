import { ApiProperty } from '@nestjs/swagger';
import { UserInfoDto } from './user-info.dto';

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: false
  })
  accessToken?: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: false
  })
  refreshToken?: string;

  @ApiProperty({ description: 'Access token expiry in seconds', example: 900, required: false })
  expiresIn?: number;

  @ApiProperty({
    description: 'User information',
    type: UserInfoDto,
    required: false,
    example: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      roles: ['USER'],
      isActive: true,
      agent: {
        agent_id: '123e4567-e89b-12d3-a456-426614174000',
        agent_name: 'Agent 1',
      }
    }
  })
  user?: UserInfoDto;

  @ApiProperty({
    description: 'Whether the user already exists in the system',
    example: true,
    required: false
  })
  isExistingUser?: boolean;

  @ApiProperty({
    description: 'Google ID for new users (when isExistingUser is false)',
    example: '123456789012345678901',
    required: false
  })
  googleId?: string;

  @ApiProperty({
    description: 'Email for new users (when isExistingUser is false)',
    example: 'user@example.com',
    required: false
  })
  email?: string;

  @ApiProperty({
    description: 'Referral code to be passed to signup (when isExistingUser is false)',
    example: 'ABC12345',
    required: false
  })
  referralCode?: string;
}
