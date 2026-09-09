import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiOkResponse
} from '@nestjs/swagger';
import { HomeService } from './services/home.service';
import { HomeQueryDto } from './dto/home-query.dto';

@ApiTags('Home')
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @ApiOperation({
    summary: 'Get home page data',
    description: `Returns all data needed for the home page in a single API call.
    
**Sections included:**
- **featuredProperties**: Properties sorted by priority (boosted, premium, featured, views)
- **featuredAds**: Ads sorted by priority (boosted, premium, featured, views)
- **districtSummary**: Top districts with property counts and price ranges
- **testimonials**: Recent user reviews with average rating
- **propertyCategories**: All property categories with counts

**Priority Order:**
Properties and Ads are sorted by: top_listing → boosted → boost_priority → premium → featured → view_count → created_at`
  })
  @ApiQuery({
    name: 'properties_limit',
    required: false,
    type: Number,
    example: 8,
    description: 'Number of featured properties to return (default: 8, max: 20)'
  })
  @ApiQuery({
    name: 'ads_limit',
    required: false,
    type: Number,
    example: 6,
    description: 'Number of featured ads to return (default: 6, max: 20)'
  })
  @ApiQuery({
    name: 'reviews_limit',
    required: false,
    type: Number,
    example: 5,
    description: 'Number of testimonials to return (default: 5, max: 20)'
  })
  @ApiQuery({
    name: 'districts_limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Number of districts to return (default: 10, max: 50)'
  })
  @ApiOkResponse({
    description: 'Home page data retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        featuredProperties: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  price: { type: 'number' },
                  listing_type: {
                    type: 'string',
                    enum: ['SALE', 'RENT', 'LEASE']
                  },
                  status: { type: 'string' },
                  city: { type: 'string' },
                  district: { type: 'string' },
                  state: { type: 'string' },
                  property_category_name: { type: 'string' },
                  is_boosted: { type: 'boolean' },
                  is_premium: { type: 'boolean' },
                  is_featured: { type: 'boolean' },
                  view_count: { type: 'number' },
                  favorite_count: { type: 'number' },
                  media: { type: 'array' }
                }
              }
            },
            total: { type: 'number' }
          }
        },
        featuredAds: {
          type: 'object',
          properties: {
            data: { type: 'array' },
            total: { type: 'number' }
          }
        },
        districtSummary: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              district: { type: 'string' },
              count: { type: 'number' },
              minAmount: { type: 'number' },
              maxAmount: { type: 'number' },
              noOfAgents: { type: 'number' },
              propertyCategories: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        testimonials: {
          type: 'object',
          properties: {
            data: { type: 'array' },
            total: { type: 'number' },
            averageRating: { type: 'number' }
          }
        },
        propertyCategories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: 'string' },
              icon: { type: 'string' },
              count: { type: 'number' }
            }
          }
        },
        stats: {
          type: 'object',
          description: 'Platform-wide statistics for hero section',
          properties: {
            totalProperties: {
              type: 'number',
              description: 'Total published and approved properties',
              example: 58,
            },
            verifiedProperties: {
              type: 'number',
              description: 'Properties with verified status',
              example: 45,
            },
            totalAgents: {
              type: 'number',
              description: 'Unique users who have posted properties',
              example: 12,
            },
            kycVerifiedAgents: {
              type: 'number',
              description: 'Agents with completed KYC verification',
              example: 8,
            },
            totalDistricts: {
              type: 'number',
              description: 'Number of districts with available properties',
              example: 15,
            },
            totalAds: {
              type: 'number',
              description: 'Total published classified ads',
              example: 10,
            },
            totalUsers: {
              type: 'number',
              description: 'Total registered users on platform',
              example: 150,
            },
            totalEnquiries: {
              type: 'number',
              description: 'Total property enquiries received',
              example: 85,
            },
          },
        },
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getHomePageData(@Query() query: HomeQueryDto) {
    return this.homeService.getHomePageData(query);
  }
}
