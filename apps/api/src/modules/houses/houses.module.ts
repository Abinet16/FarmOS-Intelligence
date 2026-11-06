import { Module } from '@nestjs/common';
import { HousesController } from './houses.controller.js';
import { HousesService } from './houses.service.js';

@Module({
  controllers: [HousesController],
  providers: [HousesService],
})
export class HousesModule {}
