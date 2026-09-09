import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { DashboardService } from './services/dashboard.services';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user dashboard',
    description: `Returns dashboard data based on the logged-in user's role.
    
**Role-based response:**
- **ADMIN**: Returns admin dashboard with platform-wide statistics
- **AGENT**: Returns agent dashboard with properties, ads, enquiries, wallet, subscription
- **BUYER**: Returns buyer dashboard with favorites, saved searches, enquiries

**Priority:** If user has multiple roles, priority is ADMIN > AGENT > BUYER`
  })
  @ApiOkResponse({
    description: 'Dashboard data retrieved successfully',
    type: DashboardResponseDto
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or missing token' })
  async getDashboard(@CurrentUser() user: any): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard({
      id: user.id,
      roles: user.roles
    });
  }
}