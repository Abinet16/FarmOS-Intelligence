import { Global, Module } from '@nestjs/common';
import { AppMetrics } from './app-metrics.js';
import { Heartbeat } from './heartbeat.js';
import { MetricsController } from './metrics.controller.js';

/**
 * One metrics registry per process, shared by middleware, guards and services,
 * and the Redis heartbeat behind the readiness check.
 */
@Global()
@Module({
  providers: [AppMetrics, Heartbeat],
  controllers: [MetricsController],
  exports: [AppMetrics, Heartbeat],
})
export class ObservabilityModule {}
