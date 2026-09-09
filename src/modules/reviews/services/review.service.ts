import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { User } from '../../users/entities/user.entity';
import { CreateReviewDto } from '../dto/create-review.dto';
import { UpdateReviewDto } from '../dto/update-review.dto';
import { ReviewResponseDto } from '../dto/review-response.dto';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>
  ) {}

  async create(dto: CreateReviewDto, userId: string): Promise<ReviewResponseDto> {
    // Check if user already has a review (one-to-one constraint)
    const existingReview = await this.reviewRepo.findOne({
      where: { user_id: userId, is_active: true }
    });

    if (existingReview) {
      throw new ForbiddenException('User already has an active review');
    }

    const review = this.reviewRepo.create({
      ...dto,
      user_id: userId,
      is_active: true,
      helpful_count: 0
    });

    const saved = await this.reviewRepo.save(review);
    return this.findOne(saved.id);
  }

  async findAll(page = 1, limit = 10): Promise<{
    data: ReviewResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skipCount = (page - 1) * limit;

    const [reviews, total] = await this.reviewRepo.findAndCount({
      where: { is_active: true },
      relations: ['user'],
      order: { created_at: 'DESC' },
      skip: skipCount,
      take: limit
    });

    const data = reviews.map(review => this.mapToResponseDto(review));

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<ReviewResponseDto> {
    const review = await this.reviewRepo.findOne({
      where: { id, is_active: true },
      relations: ['user']
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.mapToResponseDto(review);
  }

  async findReviewByUserId(userId: string): Promise<ReviewResponseDto> {
    const review = await this.reviewRepo.findOne({
      where: { user_id: userId, is_active: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found for the user with id: ' + userId);
    }

    return this.mapToResponseDto(review);
  }

  async update(id: string, dto: UpdateReviewDto, userId: string): Promise<ReviewResponseDto> {
    const review = await this.reviewRepo.findOne({
      where: { id, is_active: true }
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Check ownership
    if (review.user_id !== userId) {
      throw new ForbiddenException('You can only update your own review');
    }

    await this.reviewRepo.update(id, {
      comment: dto.comment ?? review.comment,
      rating: dto.rating ?? review.rating
    });

    return this.findOne(id);
  }

  async delete(id: string, userId: string): Promise<{ success: boolean }> {
    const review = await this.reviewRepo.findOne({
      where: { id, is_active: true }
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Check ownership
    if (review.user_id !== userId) {
      throw new ForbiddenException('You can only delete your own review');
    }

    // Soft delete
    await this.reviewRepo.delete(id);

    return { success: true };
  }

  private mapToResponseDto(review: Review): ReviewResponseDto {
    return {
      id: review.id,
      user_id: review.user_id,
      user_firstName: review.user?.firstName || null,
      user_lastName: review.user?.lastName || null,
      user_email: review.user?.email || null,
      comment: review.comment,
      rating: review.rating,
      is_active: review.is_active,
      helpful_count: review.helpful_count,
      created_at: review.created_at,
      updated_at: review.updated_at
    } as ReviewResponseDto;
  }
}

