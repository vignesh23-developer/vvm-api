import { ApiProperty } from '@nestjs/swagger';

export class AgentStatsResponseDto {
  @ApiProperty({ example: 25, description: 'Total properties ever posted' })
  totalPropertiesPosted: number;

  @ApiProperty({ example: 10, description: 'Properties marked as SOLD' })
  totalPropertiesSold: number;

  @ApiProperty({ example: 5, description: 'Properties marked as RENTED' })
  totalPropertiesRented: number;

  @ApiProperty({ example: 8, description: 'Currently active listings' })
  activeListings: number;

  @ApiProperty({ example: 2, description: 'Pending approval' })
  pendingApproval: number;

  @ApiProperty({ example: 150, description: 'Total enquiries received' })
  totalEnquiriesReceived: number;

  @ApiProperty({ example: 15, description: 'Leads converted to deals' })
  totalLeadsConverted: number;

  @ApiProperty({ example: 45, description: 'Total favorites on properties' })
  totalFavorites: number;

  @ApiProperty({ example: 500, description: 'Total property views' })
  totalViews: number;
}