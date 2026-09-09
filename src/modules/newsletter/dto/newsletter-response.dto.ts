import { ApiProperty } from '@nestjs/swagger';

export class NewsletterResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Unique identifier for the newsletter subscription'
  })
  id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address'
  })
  email: string;

  @ApiProperty({
    example: '192.168.1.1',
    description: 'IP address of the subscriber',
    nullable: true
  })
  ip_address: string | null;

  @ApiProperty({
    example: 'Chennai',
    description: 'City of the subscriber',
    nullable: true
  })
  city: string | null;

  @ApiProperty({
    example: 'Tamil Nadu',
    description: 'State of the subscriber',
    nullable: true
  })
  state: string | null;

  @ApiProperty({
    example: 'India',
    description: 'Country of the subscriber',
    nullable: true
  })
  country: string | null;

  @ApiProperty({
    example: true,
    description: 'Subscription status (true = subscribed, false = unsubscribed)'
  })
  subscription_status: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the subscriber is a platform user'
  })
  isPlatformUser: boolean;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Platform user ID if the subscriber is a platform user',
    nullable: true
  })
  platformUserId: string | null;

  @ApiProperty({
    example: '2025-01-15T10:30:00.000Z',
    description: 'When the subscription was created'
  })
  created_at: Date;

  @ApiProperty({
    example: '2025-01-15T10:30:00.000Z',
    description: 'When the subscription was last updated'
  })
  updated_at: Date;
}

