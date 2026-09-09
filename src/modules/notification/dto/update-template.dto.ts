import { CreateTemplateDto } from './create-template.dto';
import { PartialType } from '@nestjs/mapped-types';

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}