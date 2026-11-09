'use client';

import { useState } from 'react';
import { LineChart } from '@/components/charts/line-chart';
import type { CombinedDay } from '@/lib/api';
import { formatCount, formatDate, formatNumber, formatPercent } from '@/lib/format';

const percent = (value: number) => `${formatNumber(value, 1)}%`;
const kg = (value: number) => `${formatNumber(value, 3)} kg`;

/**
 * Small multiples, one measure per chart, each on its own axis. A table view
 * carries the same numbers for anyone who can't or won't read a chart.
 */
export function TrendCharts({ days }: { days: CombinedDay[] }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section aria-labelledby="trends" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="trends" className="text-lg font-medium">
          Trends
        </h2>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? 'Show charts' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-right text-sm tabular-nums">
            <caption className="sr-only">Daily production across all flocks</caption>
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Birds</th>
                <th className="px-3 py-2 font-medium">Eggs</th>
                <th className="px-3 py-2 font-medium">Hen-day</th>
                <th className="px-3 py-2 font-medium">Deaths</th>
                <th className="px-3 py-2 font-medium">Mortality</th>
                <th className="px-3 py-2 font-medium">Feed kg</th>
                <th className="px-3 py-2 font-medium">kg/bird</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {[...days].reverse().map((day) => (
                <tr key={day.date}>
                  <td className="px-3 py-1.5 text-left">{formatDate(day.date)}</td>
                  <td className="px-3 py-1.5">{formatCount(day.openingBirds)}</td>
                  <td className="px-3 py-1.5">{day.eggs === null ? '—' : formatCount(day.eggs)}</td>
                  <td className="px-3 py-1.5">{formatPercent(day.henDayPct)}</td>
                  <td className="px-3 py-1.5">{day.deaths}</td>
                  <td className="px-3 py-1.5">{formatPercent(day.mortalityRatePct)}</td>
                  <td className="px-3 py-1.5">{formatNumber(day.feedKg, 1)}</td>
                  <td className="px-3 py-1.5">{formatNumber(day.feedPerBirdKg, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <LineChart
            title="Hen-day production"
            points={days.map((d) => ({ date: d.date, value: d.henDayPct }))}
            format={percent}
          />
          <LineChart
            title="Daily mortality"
            points={days.map((d) => ({ date: d.date, value: d.mortalityRatePct }))}
            format={(value) => `${formatNumber(value, 2)}%`}
            zeroBased
          />
          <LineChart
            title="Feed per bird"
            points={days.map((d) => ({ date: d.date, value: d.feedPerBirdKg }))}
            format={kg}
          />
        </div>
      )}
    </section>
  );
}
