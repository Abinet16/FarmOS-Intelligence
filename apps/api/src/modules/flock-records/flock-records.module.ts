import { Module } from '@nestjs/common';
import { FlockRecordsController } from './flock-records.controller.js';
import { FlockRecordsService } from './flock-records.service.js';

@Module({
  controllers: [FlockRecordsController],
  providers: [FlockRecordsService],
})
export class FlockRecordsModule {}
