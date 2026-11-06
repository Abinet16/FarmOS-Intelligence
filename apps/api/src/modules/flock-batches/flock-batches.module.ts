import { Module } from '@nestjs/common';
import { FlockBatchesController } from './flock-batches.controller.js';
import { FlockBatchesService } from './flock-batches.service.js';

@Module({
  controllers: [FlockBatchesController],
  providers: [FlockBatchesService],
})
export class FlockBatchesModule {}
