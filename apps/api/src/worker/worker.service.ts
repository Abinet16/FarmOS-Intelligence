import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { hostname } from 'node:os';
import { Worker, type Job } from 'bullmq';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { BullmqJobQueue } from '../jobs/bullmq-job-queue.js';
import {
  errorText,
  JOB_QUEUE,
  QUEUE_NAMES,
  type JobName,
  type JobQueue,
  type QueueName,
} from '../jobs/jobs.js';
import { Heartbeat } from '../observability/heartbeat.js';
import { JobProcessor } from './job-processor.js';
import { schedules } from './schedules.js';

/** Jobs processed at once per queue. Reports are the heavy ones. */
const CONCURRENCY: Record<QueueName, number> = {
  reports: 2,
  alerts: 2,
  email: 5,
  maintenance: 1,
};

/**
 * Runs the BullMQ workers in the worker process: one per queue, plus the
 * recurring schedules. Shutting down lets in-flight jobs finish first.
 */
@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private readonly workers: Worker[] = [];

  constructor(
    private readonly processor: JobProcessor,
    private readonly heartbeat: Heartbeat,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap() {
    for (const name of QUEUE_NAMES) {
      const worker = new Worker(name, (job: Job) => this.run(job), {
        // Workers block on Redis; BullMQ requires unlimited retries per request.
        connection: { url: this.env.REDIS_URL, maxRetriesPerRequest: null },
        prefix: this.env.QUEUE_PREFIX,
        concurrency: CONCURRENCY[name],
      });
      worker.on('failed', (job, error) =>
        this.logger.warn(
          `${job?.name} ${job?.id} failed (attempt ${job?.attemptsMade}): ${error.message}`,
        ),
      );
      worker.on('error', (error) => this.logger.error(`Queue ${name}: ${errorText(error)}`));
      this.workers.push(worker);
    }

    if (this.queue instanceof BullmqJobQueue) {
      for (const schedule of schedules(this.env)) {
        await this.queue
          .queue(schedule.queue)
          .upsertJobScheduler(schedule.id, schedule.repeat, { name: schedule.job, data: {} });
      }
    }
    // Lets the API's readiness check see that jobs are being processed.
    this.heartbeat.start(`${hostname()}:${process.pid}`);
    this.logger.log(`Processing ${QUEUE_NAMES.join(', ')}`);
  }

  async onApplicationShutdown() {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private async run(job: Job) {
    const started = Date.now();
    const result = await this.processor.handle(job.name as JobName, job.data as never, {
      finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      now: new Date(),
    });
    this.logger.log(`${job.name} ${job.id} done in ${Date.now() - started} ms`);
    return result;
  }
}
