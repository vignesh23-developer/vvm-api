import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CompleteKycDto {
  @ApiProperty({
    description: 'Client ID received from Surepass after user verification',
    example: 'digilocker_puWsFhgqyuEpEdEWkxzm'
  })
  @IsString()
  clientId: string;

  // @ApiProperty({
  //   description: 'Verification ID from initiate response'
  // })
  // @IsUUID()
  // verificationId?: string;
}