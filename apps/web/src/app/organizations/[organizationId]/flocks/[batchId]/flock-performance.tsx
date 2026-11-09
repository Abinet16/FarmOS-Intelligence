'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LineChart } from '@/components/charts/line-chart';
import { DateRangeFilter, presetRange, type RangePreset } from '@/components/date-range-filter';
import { ErrorMessage } from '@/components/error-message';
import { SeverityBadge } from '@/components/severity-badge';
import { StatTile } from '@/components/stat-tile';
import {
  api,
  queryString,
  type Alert,
  type DailyMetrics,
  type FlockBatch,
  type FlockSummary,
  type Page,
} from '@/lib/api';
import { formatNumber, formatPercent, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

/** Window KPIs, FCR and trend charts for one flock, plus its open alerts. */
export function FlockPerformance({ batch }: { batch: FlockBatch }) {
  const organization = useOrganization();
  const canView = useCan('reports:view');
  const base = `/organizations/${organization.id}`;
  const [days, setDays] = useState<RangePreset>(30);
  const range = presetRange(days, organization.timezone);
  const laying = batch.purpose !== 'BROILER';

  const performance = useQuery({
    queryKey: ['analytics', organization.id, 'flock', batch.id, range.from, range.to],
    queryFn: () =>
      api<{ summary: FlockSummary | null; days: DailyMetrics[] }>(
        `${base}/analytics/flocks/${batch.id}${queryString(range)}`,
      ),
    enabled: canView && batch.status !== 'PLANNED',
    placeholderData: keepPreviousData,
  });
  const alerts = useQuery({
    queryKey: ['alerts', organization.id, 'batch', batch.id],
    queryFn: () => api<Page<Alert>>(`${base}/alerts?open=true&batchId=${batch.id}`),
    enabled: batch.status !== 'PLANNED',
  });

  if (batch.status === 'PLANNED') return null;

  const summary = performance.data?.summary;
  const rows = performance.data?.days ?? [];
  const series = (pick: (row: DailyMetrics) => number | null) =>
    rows.map((row) => ({ date: row.date, value: pick(row) }));

  return (
    <section aria-labelledby="performance" className="flex flex-col gap-4">
      {alerts.data && alerts.data.items.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          {alerts.data.items.map((alert) => (
            <li key={alert.id} className="flex items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              {humanize(alert.ruleCode)}
            </li>
          ))}
        </ul>
      )}

      {canView && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="performance" className="text-lg font-medium">
              Performance
            </h2>
            <DateRangeFilter value={days} onChange={setDays} />
          </div>
          <ErrorMessage error={performance.error} />
          {summary && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {laying && <StatTile label="Hen-day" value={formatPercent(summary.kpis.henDayPct)} />}
              <StatTile
                label="Mortality"
                value={formatPercent(summary.kpis.mortalityPct)}
                hint="in period"
              />
              <StatTile
                label="Feed per bird"
                value={
                  summary.kpis.feedPerBirdKg === null
                    ? '—'
                    : `${formatNumber(summary.kpis.feedPerBirdKg, 3)} kg`
                }
                hint="per day"
              />
              {!laying && (
                <StatTile
                  label="FCR"
                  value={formatNumber(summary.fcr, 2)}
                  hint={
                    summary.fcr === null
                      ? 'needs two weigh days and daily feed'
                      : 'between weigh days'
                  }
                />
              )}
            </div>
          )}
          {rows.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              {laying && (
                <LineChart
                  title="Hen-day production"
                  points={series((row) => row.henDayPct)}
                  format={(value) => `${formatNumber(value, 1)}%`}
                />
              )}
              <LineChart
                title="Daily mortality"
                points={series((row) => row.mortalityRatePct)}
                format={(value) => `${formatNumber(value, 2)}%`}
                zeroBased
              />
              <LineChart
                title="Feed per bird"
                points={series((row) => row.feedPerBirdKg)}
                format={(value) => `${formatNumber(value, 3)} kg`}
              />
              <LineChart
                title="Average weight"
                points={series((row) => row.averageWeightGrams)}
                format={(value) => `${formatNumber(value, 0)} g`}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
