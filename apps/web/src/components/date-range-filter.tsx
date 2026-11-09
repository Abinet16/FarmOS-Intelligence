'use client';

import { todayIn } from '@/lib/format';

export const RANGE_PRESETS = [7, 30, 90] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** The date window for a preset, ending today in the organization's time zone. */
export function presetRange(days: RangePreset, timeZone: string) {
  const to = todayIn(timeZone);
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to };
}

/** Segmented control for the dashboard window; sits in the filter row above the charts. */
export function DateRangeFilter({
  value,
  onChange,
}: {
  value: RangePreset;
  onChange: (days: RangePreset) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Date range"
      className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {RANGE_PRESETS.map((days) => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={value === days}
          onClick={() => onChange(days)}
          className={`rounded px-3 py-1 text-sm ${
            value === days
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          }`}
        >
          {days} days
        </button>
      ))}
    </div>
  );
}
