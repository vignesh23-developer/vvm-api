import { Controller, Post, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { RegisterService } from './services/register.service';
import { ApiStandardResponses } from '../../../common';
import { RegisterDto, RegisterResponseDto } from './dto';
import { SendRegistrationOtpDto } from './dto/send-registration-otp.dto';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('register')
export class RegisterController {
  constructor(private readonly registerService: RegisterService) {}

  @ApiOperation({ summary: 'Send OTP for registration' })
  @ApiBody({
    type: SendRegistrationOtpDto,
    description: 'Phone number to send registration OTP'
  })
  @ApiStandardResponses(SendRegistrationOtpDto, {
    successStatus: 200,
    includeAuth: false,
    includeValidation: true
  })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  sendRegistrationOtp(
    @Body() sendOtpDto: SendRegistrationOtpDto,
    @Req() req: Request
  ): Promise<{ message: string }> {
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.registerService.sendRegistrationOtp(sendOtpDto, ipAddress, userAgent);
  }

  @ApiOperation({ summary: 'User registration' })
  @ApiBody({
    type: RegisterDto,
    description: 'User registration data',
    examples: {
      otpFirst: {
        summary: 'Register with phone + OTP (no password)',
        value: {
          phoneNumber: '+1234567890',
          otp: '123456',
          email: 'newuser@example.com',
          firstName: 'John',
          lastName: 'Doe'
        }
      },
      withPassword: {
        summary: 'Register with optional password',
        value: {
          phoneNumber: '+1234567890',
          otp: '123456',
          email: 'newuser@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe'
        }
      }
    }
  })
  @ApiStandardResponses(RegisterResponseDto, {
    successStatus: 201,
    includeAuth: false,
    includeValidation: true,
    includeConflict: true
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(@Body() registerDto: RegisterDto): Promise<RegisterResponseDto> {
    return this.registerService.register(registerDto);
  }
}
