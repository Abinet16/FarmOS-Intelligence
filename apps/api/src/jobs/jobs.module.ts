import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AppMetrics } from '../observability/app-metrics.js';
import { BullmqJobQueue } from './bullmq-job-queue.js';
import { JOB_QUEUE } from './jobs.js';

export function queueSettings(env: Env) {
  return {
    // Fail fast instead of buffering commands while Redis is down; the
    // database keeps the work and the sweep enqueues it later.
    connection: { url: env.REDIS_URL, enableOfflineQueue: false, maxRetriesPerRequest: 1 },
    prefix: env.QUEUE_PREFIX,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [ENV, AppMetrics],
      useFactory: (env: Env, metrics: AppMetrics) =>
        new BullmqJobQueue(queueSettings(env), metrics),
    },
  ],
  exports: [JOB_QUEUE],
})
export class JobsModule {}
