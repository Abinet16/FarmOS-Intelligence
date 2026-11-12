'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/error-message';
import { ExportButton } from '@/components/export-button';
import { api, type DailyMetrics, type FlockBatch } from '@/lib/api';
import { formatCount, formatDate, formatNumber, formatPercent } from '@/lib/format';
import { useOrganization } from '@/lib/organization-context';

/** The last two weeks, one row per day. A dash means nothing was recorded. */
export function DailyMetricsTable({ batch }: { batch: FlockBatch }) {
  const organization = useOrganization();
  const laying = batch.purpose !== 'BROILER';

  const metrics = useQuery({
    queryKey: ['flock-records', batch.id, 'daily-metrics'],
    queryFn: () =>
      api<{ from: string; to: string; days: DailyMetrics[] }>(
        `/organizations/${organization.id}/flock-batches/${batch.id}/daily-metrics`,
      ),
    enabled: batch.status !== 'PLANNED',
  });

  if (batch.status === 'PLANNED') return null;

  return (
    <section aria-labelledby="daily-metrics" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="daily-metrics" className="text-lg font-medium">
          Last 14 days
        </h2>
        {metrics.data && (
          <ExportButton
            type="daily_production"
            parameters={{ batchId: batch.id, from: metrics.data.from, to: metrics.data.to }}
          />
        )}
      </div>
      <ErrorMessage error={metrics.error} />
      {metrics.data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-right text-sm tabular-nums">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Birds</th>
                <th className="px-3 py-2 font-medium">Deaths</th>
                <th className="px-3 py-2 font-medium">Mortality</th>
                {laying && <th className="px-3 py-2 font-medium">Eggs</th>}
                {laying && <th className="px-3 py-2 font-medium">Hen-day</th>}
                <th className="px-3 py-2 font-medium">Feed kg</th>
                <th className="px-3 py-2 font-medium">kg/bird</th>
                <th className="px-3 py-2 font-medium">Water L</th>
                <th className="px-3 py-2 font-medium">Avg g</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {metrics.data.days.map((day) => (
                <tr key={day.date}>
                  <td className="px-3 py-1.5 text-left">{formatDate(day.date)}</td>
                  <td className="px-3 py-1.5">{day.ageDays}</td>
                  <td className="px-3 py-1.5">{formatCount(day.openingBirds)}</td>
                  <td className="px-3 py-1.5">{day.deaths || '—'}</td>
                  <td className="px-3 py-1.5">{formatPercent(day.mortalityRatePct)}</td>
                  {laying && (
                    <td className="px-3 py-1.5">
                      {day.eggs === null ? '—' : formatCount(day.eggs)}
                    </td>
                  )}
                  {laying && <td className="px-3 py-1.5">{formatPercent(day.henDayPct)}</td>}
                  <td className="px-3 py-1.5">{formatNumber(day.feedKg, 1)}</td>
                  <td className="px-3 py-1.5">{formatNumber(day.feedPerBirdKg, 3)}</td>
                  <td className="px-3 py-1.5">{formatNumber(day.waterLitres, 1)}</td>
                  <td className="px-3 py-1.5">{formatNumber(day.averageWeightGrams, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
