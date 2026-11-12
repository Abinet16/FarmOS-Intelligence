import type { Env } from '../config/env.js';
import type { JobName, QueueName } from '../jobs/jobs.js';

export interface Schedule {
  /** Stable id: upserting it on every start replaces, never duplicates, the schedule. */
  id: string;
  queue: QueueName;
  job: JobName;
  repeat: { pattern: string; tz: 'UTC' } | { every: number };
}

/** Recurring jobs, registered by the worker on start. */
export function schedules(env: Env): Schedule[] {
  return [
    {
      // Hourly by default: each organization's "yesterday" ends at a different
      // UTC hour, and evaluation is idempotent, so re-running costs nothing.
      id: 'alerts-evaluate-all',
      queue: 'alerts',
      job: 'alerts.evaluate-all',
      repeat: { pattern: env.ALERT_EVALUATION_CRON, tz: 'UTC' },
    },
    {
      id: 'maintenance-sweep',
      queue: 'maintenance',
      job: 'maintenance.sweep',
      repeat: { every: 5 * 60_000 },
    },
  ];
}
