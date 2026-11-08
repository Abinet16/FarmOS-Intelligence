import { Module } from '@nestjs/common';
import { FlockHealthController } from './flock-health.controller.js';
import { FlockHealthService } from './flock-health.service.js';
import { VaccinesService } from './vaccines.service.js';

@Module({
  controllers: [FlockHealthController],
  providers: [VaccinesService, FlockHealthService],
})
export class FlockHealthModule {}
