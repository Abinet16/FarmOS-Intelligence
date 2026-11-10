import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { ASSISTANT_MODEL, createAssistantModel } from './assistant-model.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [AnalyticsModule, AlertsModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    {
      provide: ASSISTANT_MODEL,
      useFactory: (env: Env) => createAssistantModel(env),
      inject: [ENV],
    },
  ],
})
export class AssistantModule {}
