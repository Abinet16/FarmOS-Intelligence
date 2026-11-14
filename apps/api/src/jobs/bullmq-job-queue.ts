import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import {
  JOB_ATTEMPTS,
  JOB_BACKOFF_MS,
  errorText,
  queueOf,
  type EnqueueOptions,
  type JobName,
  type JobPayloads,
  type JobQueue,
  type QueueName,
} from './jobs.js';
import type { AppMetrics } from '../observability/app-metrics.js';

const HOUR_S = 3_600;
/**
 * BullMQ waits for a connection rather than failing, so an add while Redis is
 * down would hang the request that triggered it. Past this, give up: the work
 * is in the database and the sweep enqueues it (job ids make a late add harmless).
 */
export const ENQUEUE_TIMEOUT_MS = 2_000;

/** Shared defaults: retries with backoff, and bounded history in Redis. */
export const defaultJobOptions = {
  attempts: JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: JOB_BACKOFF_MS },
  // Completed ids are kept a day, which is what makes jobId deduplicate retries.
  removeOnComplete: { age: 24 * HOUR_S, count: 5_000 },
  removeOnFail: { age: 7 * 24 * HOUR_S },
} as const;

export interface QueueSettings {
  connection: ConnectionOptions;
  prefix: string;
}

/** JobQueue on BullMQ. Queues are created on first use and closed on shutdown. */
export class BullmqJobQueue implements JobQueue, OnModuleDestroy {
  private readonly logger = new Logger('JobQueue');
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly settings: QueueSettings,
    private readonly metrics?: AppMetrics,
  ) {}

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { ...this.settings, defaultJobOptions });
      // Without a listener a connection error would be an unhandled 'error' event.
      queue.on('error', (error) => this.logger.warn(`Queue ${name}: ${errorText(error)}`));
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue<K extends JobName>(
    name: K,
    data: JobPayloads[K],
    options: EnqueueOptions = {},
  ): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), ENQUEUE_TIMEOUT_MS);
    });
    try {
      const added = this.queue(queueOf(name)).add(name, data, { jobId: options.jobId });
      added.catch(() => undefined); // a late failure after the timeout is already logged
      await Promise.race([added, timeout]);
      this.metrics?.jobsEnqueued.inc({ job: name, result: 'queued' });
      return true;
    } catch (error) {
      this.metrics?.jobsEnqueued.inc({ job: name, result: 'failed' });
      this.logger.warn(`Could not enqueue ${name} (the sweep will retry): ${errorText(error)}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
