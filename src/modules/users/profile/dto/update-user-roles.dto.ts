import { UserType } from '../../enums/usertype';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateUserRolesDto {
  @ApiProperty({
    description: 'Array of roles to assign to the user',
    example: ['BUYER', 'SELLER'],
    enum: UserType,
    isArray: true
  })
  @IsArray()
  @IsEnum(UserType, { each: true, message: 'Each role must be a valid UserType' })
  @IsNotEmpty({ message: 'Roles array is required' })
  roles: UserType[];
}

export class UpdateUserRolesResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'User roles updated successfully' })
  message: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: ['BUYER', 'AGENT', 'ADMIN'], enum: UserType, isArray: true })
  roles: UserType[];
}