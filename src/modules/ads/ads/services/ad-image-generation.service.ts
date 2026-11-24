import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { Ad } from '../../entities/ad.entity';
import { UserType } from '../../../users/enums/usertype';

@Injectable()
export class AdImageGenerationService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Ad)
    private readonly adRepository: Repository<Ad>,
  ) {}

  async generate(adId: string, userId: string, userRoles: UserType[]) {
    if (
      !userRoles?.includes(UserType.ADMIN) &&
      !userRoles?.includes(UserType.AGENT)
    ) {
      throw new ForbiddenException('Only Admin and Agent can generate AI images.');
    }

    const ad = await this.adRepository.findOne({
      where: { id: adId },
      relations: { category: true },
    });

    if (!ad) {
      throw new NotFoundException('Ad not found.');
    }

    if (
      !userRoles.includes(UserType.ADMIN) &&
      ad.owner_id !== userId
    ) {
      throw new ForbiddenException(
        'You can generate images only for your own ads.',
      );
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI image generation is not configured.',
      );
    }

    const location = [
      ad.city,
      ad.district,
      ad.state,
      ad.country,
    ].filter(Boolean).join(', ');

    const prompt = `
Create a high-quality, photorealistic promotional visual for an online classified advertisement.

Ad title: ${ad.title}
Category: ${ad.category?.name || 'General'}
Description: ${ad.description}
Location: ${location || 'Not specified'}

Visual requirements:
- Create an attractive, professional marketing image relevant to this advertisement.
- Use realistic lighting, natural colours, and a clean composition.
- Make the main subject clearly visible.
- Do not add text, prices, labels, logos, watermarks, phone numbers, or contact details.
- Do not invent specific features that are not supported by the description.
- Treat this as an AI-generated illustrative visual, not a photograph proving the exact condition or appearance of an actual item or property.
- Square image composition suitable for an online classified listing.
`;

    try {
      const openai = new OpenAI({ apiKey });

      const result = await openai.images.generate({
        model: 'gpt-image-2.5-sunburst',
        prompt,
      });

      const imageBase64 = result.data?.[0]?.b64_json;

      if (!imageBase64) {
        throw new BadGatewayException(
          'AI did not return an image. Please try again.',
        );
      }

      return {
        success: true,
        imageBase64,
        mimeType: 'image/png',
        fileName: `ai-generated-ad-${ad.id}.png`,
        disclaimer:
          'AI-generated illustrative image. It may not represent the exact item or property.',
      };
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      throw new BadGatewayException(
        'Unable to generate the AI image right now. Please try again.',
      );
    }
  }
}
