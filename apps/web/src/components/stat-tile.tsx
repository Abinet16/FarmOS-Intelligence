import type { ReactNode } from 'react';

/** A headline number. The label names it; the hint says what it is measured against. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}
