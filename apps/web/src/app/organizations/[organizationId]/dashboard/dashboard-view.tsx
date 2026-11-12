'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { DateRangeFilter, presetRange, type RangePreset } from '@/components/date-range-filter';
import { ErrorMessage } from '@/components/error-message';
import { StatTile } from '@/components/stat-tile';
import {
  api,
  queryString,
  type AnalyticsOverview,
  type CombinedDay,
  type Farm,
  type FarmComparison,
  type FlockSummary,
  type Page,
} from '@/lib/api';
import { formatCount, formatDate, formatNumber, formatPercent } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';
import { AlertSettingsForm } from './alert-settings-form';
import { AlertsPanel } from './alerts-panel';
import { FarmComparisonTable } from './farm-comparison';
import { FlockComparisonTable } from './flock-comparison';
import { TrendCharts } from './trend-charts';

/** One analytics endpoint for the current filters; keeps the old data while refetching. */
function useAnalytics<T>(
  path: string,
  { organizationId, query, enabled }: { organizationId: string; query: string; enabled: boolean },
) {
  return useQuery({
    queryKey: ['analytics', organizationId, path, query],
    queryFn: () => api<T>(`/organizations/${organizationId}/analytics/${path}${query}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * The manager's view: headline numbers, trends and comparisons for a chosen
 * window, plus what needs attention. Everyone sees alerts; the figures need
 * `reports:view`.
 */
export function DashboardView() {
  const organization = useOrganization();
  const canView = useCan('reports:view');
  const base = `/organizations/${organization.id}`;
  const [days, setDays] = useState<RangePreset>(30);
  const [farmId, setFarmId] = useState('');
  const range = presetRange(days, organization.timezone);
  const query = queryString({ ...range, farmId });

  const params = { organizationId: organization.id, query, enabled: canView };
  const overview = useAnalytics<AnalyticsOverview>('overview', params);
  const trend = useAnalytics<{ days: CombinedDay[] }>('trend', params);
  const farms = useAnalytics<FarmComparison>('farms', params);
  const flocks = useAnalytics<{ flocks: FlockSummary[] }>('flocks', params);

  const farmOptions = useQuery({
    queryKey: ['farms', organization.id, { pageSize: 100 }],
    queryFn: () => api<Page<Farm>>(`${base}/farms${queryString({ pageSize: 100 })}`),
    enabled: canView,
  });

  if (!canView) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <AlertsPanel />
        <p className="text-sm text-zinc-500">
          Go to{' '}
          <Link href={`${base}/flocks`} className="underline">
            Flocks
          </Link>{' '}
          to record the day.
        </p>
      </>
    );
  }

  const o = overview.data;
  const openAlerts = o ? Object.values(o.alerts).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {formatDate(range.from)} – {formatDate(range.to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Farm"
            className="input py-1.5 text-sm"
            value={farmId}
            onChange={(event) => setFarmId(event.target.value)}
          >
            <option value="">All farms</option>
            {farmOptions.data?.items.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
          <DateRangeFilter value={days} onChange={setDays} />
        </div>
      </div>

      <ErrorMessage error={overview.error ?? trend.error ?? farms.error ?? flocks.error} />

      {o && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatTile
            label="Live birds"
            value={formatCount(o.flocks.liveBirds)}
            hint={`${o.flocks.active} active flocks`}
          />
          <StatTile
            label="Hen-day"
            value={formatPercent(o.production.kpis.henDayPct)}
            hint={`${formatCount(o.production.totals.eggs)} eggs`}
          />
          <StatTile
            label="Mortality"
            value={formatPercent(o.production.kpis.mortalityPct)}
            hint={`${formatCount(o.production.totals.deaths)} deaths in period`}
          />
          <StatTile
            label="Feed per bird"
            value={
              o.production.kpis.feedPerBirdKg === null
                ? '—'
                : `${formatNumber(o.production.kpis.feedPerBirdKg, 3)} kg`
            }
            hint="per day"
          />
          <StatTile
            label="Health"
            value={formatCount(o.health.openEvents)}
            hint={`open observations · ${o.health.vaccinationsOverdue} vaccinations overdue`}
          />
          <StatTile
            label="Attention"
            value={formatCount(openAlerts)}
            hint={`open alerts · ${o.inventory.lowStock} items low`}
          />
        </div>
      )}

      {trend.data && <TrendCharts days={trend.data.days} />}

      <AlertsPanel />

      {farms.data && !farmId && <FarmComparisonTable data={farms.data} />}
      {flocks.data && (
        <FlockComparisonTable
          base={base}
          flocks={flocks.data.flocks}
          exportParameters={{ ...range, ...(farmId && { farmId }) }}
        />
      )}

      <AlertSettingsForm />
    </>
  );
}
