import { ApiProperty } from '@nestjs/swagger';

export class ReviewResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Unique identifier for the review'
  })
  id: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID of the user who created the review'
  })
  user_id: string;

  @ApiProperty({
    example: 'John',
    description: 'First name of the user',
    nullable: true
  })
  user_firstName: string | null;

  @ApiProperty({
    example: 'Doe',
    description: 'Last name of the user',
    nullable: true
  })
  user_lastName: string | null;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Email of the user',
    nullable: true
  })
  user_email: string | null;

  @ApiProperty({
    example: 'Great service! Highly recommended.',
    description: 'Review comment'
  })
  comment: string;

  @ApiProperty({
    example: 5,
    description: 'Rating from 1 to 5',
    minimum: 1,
    maximum: 5
  })
  rating: number;

  @ApiProperty({
    example: true,
    description: 'Whether this review is active'
  })
  is_active: boolean;

  @ApiProperty({
    example: 10,
    description: 'Number of helpful votes'
  })
  helpful_count: number;

  @ApiProperty({
    example: '2025-01-15T10:30:00.000Z',
    description: 'When this review was created'
  })
  created_at: Date;

  @ApiProperty({
    example: '2025-01-15T10:30:00.000Z',
    description: 'When this review was last updated'
  })
  updated_at: Date;
}

