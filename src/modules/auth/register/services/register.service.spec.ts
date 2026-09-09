import { Test, TestingModule } from '@nestjs/testing';
import { RegisterService } from './register.service';
import { describe, beforeEach, it, expect } from '@jest/globals';

describe('RegisterService', () => {
  let service: RegisterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RegisterService],
    }).compile();

    service = module.get<RegisterService>(RegisterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
