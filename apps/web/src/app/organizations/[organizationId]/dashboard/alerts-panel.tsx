'use client';

import { ALERT_RULES } from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorMessage } from '@/components/error-message';
import { SeverityBadge } from '@/components/severity-badge';
import { api, type Alert, type Page } from '@/lib/api';
import { formatDate, formatNumber, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

/** One line describing what the alert found, from its recorded details. */
function describe(alert: Alert): string {
  const d = (alert.details ?? {}) as Record<string, string | number | string[] | null>;
  switch (alert.ruleCode) {
    case 'HIGH_DAILY_MORTALITY':
      return `${d.deaths} deaths on ${formatDate(String(d.date))}: ${formatNumber(Number(d.mortalityRatePct))}% of the flock`;
    case 'HEN_DAY_DROP':
      return `Hen-day ${formatNumber(Number(d.henDayPct))}% against a ${formatNumber(Number(d.baselinePct))}% baseline`;
    case 'FEED_INTAKE_DROP':
      return `Feed per bird ${formatNumber(Number(d.dropPct), 0)}% below baseline`;
    case 'MISSING_RECORDS':
      return `No ${(d.missing as string[]).join(' or ')} recorded for ${formatDate(String(d.date))}`;
    case 'VACCINATION_OVERDUE':
      return `${d.vaccine} was due ${formatDate(String(d.scheduledDate))}`;
    case 'LOW_STOCK':
      return `${d.item} at ${d.farm}: ${formatNumber(Number(d.balance), 1)} ${d.unit} left (reorder at ${formatNumber(Number(d.reorderLevel), 1)})`;
    default:
      return ALERT_RULES[alert.ruleCode];
  }
}

export function AlertsPanel() {
  const organization = useOrganization();
  const canReview = useCan('production:approve-correction');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['alerts', organization.id] }),
      queryClient.invalidateQueries({ queryKey: ['analytics', organization.id] }),
    ]);

  const alerts = useQuery({
    queryKey: ['alerts', organization.id, 'open'],
    queryFn: () => api<Page<Alert>>(`${base}/alerts?open=true&pageSize=50`),
  });

  const evaluate = useMutation({
    mutationFn: () =>
      api<{ date: string; created: number }>(`${base}/alerts/evaluate`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: refresh,
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'acknowledge' | 'resolve' }) =>
      api(`${base}/alerts/${id}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  });

  return (
    <section aria-labelledby="alerts" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="alerts" className="text-lg font-medium">
          Open alerts
        </h2>
        {canReview && (
          <button
            type="button"
            className="btn-secondary"
            disabled={evaluate.isPending}
            onClick={() => evaluate.mutate()}
          >
            {evaluate.isPending ? 'Checking…' : 'Check yesterday’s records'}
          </button>
        )}
      </div>
      {evaluate.data && (
        <p className="text-sm text-zinc-500" role="status">
          Checked {formatDate(evaluate.data.date)}: {evaluate.data.created} new alert
          {evaluate.data.created === 1 ? '' : 's'}.
        </p>
      )}
      <ErrorMessage error={alerts.error ?? evaluate.error ?? act.error} />
      {alerts.data?.total === 0 && (
        <p className="text-sm text-zinc-500">Nothing needs attention.</p>
      )}
      {alerts.data && alerts.data.items.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {alerts.data.items.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={alert.severity} />
                  <strong>{humanize(alert.ruleCode)}</strong>
                  {alert.batch && (
                    <Link href={`${base}/flocks/${alert.batch.id}`} className="hover:underline">
                      {alert.batch.batchCode}
                    </Link>
                  )}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">{describe(alert)}</span>
              </div>
              {canReview ? (
                <span className="flex gap-3">
                  {alert.status === 'OPEN' ? (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => act.mutate({ id: alert.id, action: 'acknowledge' })}
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <span className="text-zinc-500">Seen by {alert.acknowledger?.name}</span>
                  )}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => act.mutate({ id: alert.id, action: 'resolve' })}
                  >
                    Resolve
                  </button>
                </span>
              ) : (
                <span className="text-zinc-500">{humanize(alert.status)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
