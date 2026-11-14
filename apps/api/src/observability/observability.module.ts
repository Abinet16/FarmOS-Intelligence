import { Global, Module } from '@nestjs/common';
import { AppMetrics } from './app-metrics.js';
import { MetricsController } from './metrics.controller.js';

/** One metrics registry per process, shared by middleware, guards and services. */
@Global()
@Module({
  providers: [AppMetrics],
  controllers: [MetricsController],
  exports: [AppMetrics],
})
export class ObservabilityModule {}
