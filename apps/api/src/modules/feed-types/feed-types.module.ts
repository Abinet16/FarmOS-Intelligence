import { Module } from '@nestjs/common';
import { FeedTypesController } from './feed-types.controller.js';
import { FeedTypesService } from './feed-types.service.js';

@Module({
  controllers: [FeedTypesController],
  providers: [FeedTypesService],
})
export class FeedTypesModule {}
