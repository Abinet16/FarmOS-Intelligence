import type { BatchStatus } from '@farmos/shared-types';
import { humanize } from '@/lib/format';

const STYLES: Record<BatchStatus | 'ARCHIVED', string> = {
  PLANNED: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  DEPLETED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CLOSED: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  ARCHIVED: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

export function StatusBadge({ status }: { status: BatchStatus | 'ARCHIVED' }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {humanize(status)}
    </span>
  );
}
