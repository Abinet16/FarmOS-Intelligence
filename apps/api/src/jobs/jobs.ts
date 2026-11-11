/**
 * Background jobs: each name maps to a queue (the part before the dot) and a
 * payload. Payloads carry ids only; processors load current state from the
 * database, so a retried or late job never acts on stale data.
 */
export interface JobPayloads {
  /** Generate one requested report. */
  'reports.generate': { organizationId: string; reportJobId: string };
  /** Evaluate one organization's alert rules for its last complete day. */
  'alerts.evaluate': { organizationId: string };
  /** Fan out alerts.evaluate to every active organization (scheduled). */
  'alerts.evaluate-all': Record<string, never>;
  /** Email one notification to its recipient. */
  'email.send': { organizationId: string; notificationId: string };
  /** Re-enqueue lost jobs, fail stuck ones and delete expired report files (scheduled). */
  'maintenance.sweep': Record<string, never>;
}

export type JobName = keyof JobPayloads;

export const QUEUE_NAMES = ['reports', 'alerts', 'email', 'maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export function queueOf(name: JobName): QueueName {
  return name.slice(0, name.indexOf('.')) as QueueName;
}

export interface EnqueueOptions {
  /** Deduplicates: a job with the same id that is still known to the queue is not added again. */
  jobId?: string;
}

/**
 * Adds jobs to the queues. Enqueueing happens after the database transaction
 * that created the work has committed, and never throws: if Redis is
 * unreachable the work stays recorded in the database (QUEUED or PENDING) and
 * the maintenance sweep enqueues it later.
 */
export interface JobQueue {
  enqueue<K extends JobName>(
    name: K,
    data: JobPayloads[K],
    options?: EnqueueOptions,
  ): Promise<boolean>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');

/** Retries with exponential backoff (5 s, 10 s, 20 s) before a job counts as failed. */
export const JOB_ATTEMPTS = 3;
export const JOB_BACKOFF_MS = 5_000;
