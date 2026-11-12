import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service.js';
import {
  JOB_QUEUE,
  type EnqueueOptions,
  type JobName,
  type JobPayloads,
  type JobQueue,
} from '../../src/jobs/jobs.js';
import type { Mailer, MailMessage } from '../../src/mail/mailer.js';
import { AlertsService } from '../../src/modules/alerts/alerts.service.js';
import { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import { ReportsService } from '../../src/modules/reports/reports.service.js';
import { JobProcessor, type JobContext } from '../../src/worker/job-processor.js';

export interface RecordedJob<K extends JobName = JobName> {
  name: K;
  data: JobPayloads[K];
  options: EnqueueOptions;
}

/**
 * Stands in for BullMQ in integration tests: records what would be enqueued
 * (deduplicating by job id, as BullMQ does) so a test can run it explicitly.
 */
export class RecordingJobQueue implements JobQueue {
  jobs: RecordedJob[] = [];
  /** Set to make enqueue fail, as when Redis is unreachable. */
  down = false;

  enqueue<K extends JobName>(name: K, data: JobPayloads[K], options: EnqueueOptions = {}) {
    if (this.down) return Promise.resolve(false);
    if (!options.jobId || !this.jobs.some((job) => job.options.jobId === options.jobId)) {
      this.jobs.push({ name, data, options } as RecordedJob);
    }
    return Promise.resolve(true);
  }

  /** Removes and returns the recorded jobs with this name. */
  take<K extends JobName>(name: K): RecordedJob<K>[] {
    const taken = this.jobs.filter((job): job is RecordedJob<K> => job.name === name);
    this.jobs = this.jobs.filter((job) => job.name !== name);
    return taken;
  }
}

export class RecordingMailer implements Mailer {
  sent: MailMessage[] = [];
  /** Set to make delivery throw, as when the provider is down. */
  failing = false;

  send(message: MailMessage) {
    if (this.failing) return Promise.reject(new Error('mail provider unavailable'));
    this.sent.push(message);
    return Promise.resolve();
  }
}

/** The worker's job processor, built from the test app's services. */
export function jobProcessor(app: INestApplication) {
  return new JobProcessor(
    app.get(PrismaService),
    app.get(ReportsService),
    app.get(AlertsService),
    app.get(NotificationsService),
    app.get<JobQueue>(JOB_QUEUE),
  );
}

/** Runs every recorded job with this name, as the worker would. */
export async function runJobs<K extends JobName>(
  app: INestApplication,
  name: K,
  context: Partial<JobContext> = {},
) {
  const queue = app.get<RecordingJobQueue>(JOB_QUEUE);
  const processor = jobProcessor(app);
  const results = [];
  for (const job of queue.take(name)) {
    results.push(
      await processor.handle(job.name, job.data, {
        finalAttempt: true,
        now: new Date(),
        ...context,
      }),
    );
  }
  return results;
}
