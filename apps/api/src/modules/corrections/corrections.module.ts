import { Module } from '@nestjs/common';
import { CorrectionsController } from './corrections.controller.js';
import { CorrectionsService } from './corrections.service.js';

@Module({
  controllers: [CorrectionsController],
  providers: [CorrectionsService],
})
export class CorrectionsModule {}
