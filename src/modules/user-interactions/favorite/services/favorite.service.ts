import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from '../../entities/favorite.entity';
import { ToggleFavoriteDto } from '../dto';
import { EntityType } from '../../../search/saved-search/dto';
import { Property } from '../../../property/entities/properties.entity';
import { Ad } from '../../../ads/entities/ad.entity';
import { PropertyIndexingService } from '../../../search';
import { AdIndexingService } from '../../../search/services/ad-indexing.service';

@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(Ad)
    private readonly adsRepository: Repository<Ad>,
    private readonly propertyIndexingService: PropertyIndexingService,
    private readonly adIndexingService: AdIndexingService
  ) {}

  async findAllByUser(userId: string, entityType?: EntityType) {
    const where: any = { user_id: userId };
    if (entityType) {
      where.entity_type = entityType;
    }

    return this.favoriteRepository.find({
      where,
      order: { created_at: 'DESC' }
    });
  }

  async toggleFavorite(dto: ToggleFavoriteDto, userId: string) {
    const existing = await this.favoriteRepository.findOne({
      where: {
        user_id: userId,
        entity_type: dto.entity_type,
        entity_id: dto.entity_id
      }
    });

    if (existing) {
      await this.favoriteRepository.remove(existing);

      if (existing.entity_type === EntityType.PROPERTY) {
        await this.propertyRepository.decrement(
          { id: existing.entity_id },
          'favorite_count',
          1
        );
        await this.propertyIndexingService.updateProperty(existing.entity_id);
      } else if (existing.entity_type === EntityType.AD) {
        await this.adsRepository.decrement(
          { id: existing.entity_id },
          'favorite_count',
          1
        );
        await this.adIndexingService.updateAd(existing.entity_id);
      }
      return { action: 'removed', is_favorited: false };
    } else {
      const favorite = this.favoriteRepository.create({
        user_id: userId,
        entity_type: dto.entity_type,
        entity_id: dto.entity_id
      });

      const saved = await this.favoriteRepository.save(favorite);

      if (dto.entity_type === EntityType.PROPERTY) {
        await this.propertyRepository.increment(
          { id: dto.entity_id },
          'favorite_count',
          1
        );
        await this.propertyIndexingService.updateProperty(dto.entity_id);
      } else if (dto.entity_type === EntityType.AD) {
        await this.adsRepository.increment(
          { id: dto.entity_id },
          'favorite_count',
          1
        );
        await this.adIndexingService.updateAd(dto.entity_id);
      }

      return { action: 'added', is_favorited: true, favorite: saved };
    }
  }

  async isFavorited(
    userId: string,
    entityType: EntityType,
    entityId: string
  ): Promise<boolean> {
    const favorite = await this.favoriteRepository.findOne({
      where: {
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId
      }
    });

    return !!favorite;
  }

  async removeFavoriteById(id: string, userId: string) {
    const favorite = await this.favoriteRepository.findOne({
      where: { id, user_id: userId }
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    await this.favoriteRepository.remove(favorite);
    return { success: true };
  }
}
