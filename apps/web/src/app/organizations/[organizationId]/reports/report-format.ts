import type { JobStatus, ReportParameters } from '@farmos/shared-types';
import { formatDate } from '@/lib/format';

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  QUEUED: 'Waiting',
  RUNNING: 'Generating',
  SUCCEEDED: 'Ready',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

export const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  QUEUED: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  RUNNING: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  EXPIRED: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

/** Jobs the worker hasn't finished: the list keeps polling while any exist. */
export function inProgress(status: JobStatus): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

/** "1 Oct 2026 – 7 Oct 2026, North farm" for a job's stored parameters. */
export function describeParameters(
  parameters: ReportParameters,
  names: { farms: Map<string, string>; flocks: Map<string, string> },
): string {
  const parts: string[] = [];
  if (parameters.from && parameters.to) {
    parts.push(`${formatDate(parameters.from)} – ${formatDate(parameters.to)}`);
  } else {
    parts.push('Current figures');
  }
  if (parameters.farmId) parts.push(names.farms.get(parameters.farmId) ?? 'One farm');
  if (parameters.batchId) parts.push(names.flocks.get(parameters.batchId) ?? 'One flock');
  return parts.join(', ');
}

/** Days covered by an inclusive range, or null while either date is missing. */
export function rangeDays(from: string, to: string): number | null {
  if (!from || !to) return null;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}
