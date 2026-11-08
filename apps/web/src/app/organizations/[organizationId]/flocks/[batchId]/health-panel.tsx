'use client';

import {
  HEALTH_CATEGORIES,
  RESOLUTION_STATUSES,
  SEVERITIES,
  type ResolutionStatus,
} from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import {
  api,
  type FlockBatch,
  type HealthEvent,
  type Page,
  type Vaccination,
  type Vaccine,
} from '@/lib/api';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

/**
 * Vaccinations and health observations for one flock. These are records of
 * what was planned, given and seen; diagnosis stays with the veterinarian.
 */
export function HealthPanel({ batch }: { batch: FlockBatch }) {
  const organization = useOrganization();
  const canRecord = useCan('health:record');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;
  const batchUrl = `${base}/flock-batches/${batch.id}`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['health', batch.id] });

  const vaccines = useQuery({
    queryKey: ['vaccines', organization.id],
    queryFn: () => api<Vaccine[]>(`${base}/vaccines`),
    enabled: canRecord,
  });
  const vaccinations = useQuery({
    queryKey: ['health', batch.id, 'vaccinations'],
    queryFn: () => api<Page<Vaccination>>(`${base}/vaccinations?batchId=${batch.id}&pageSize=100`),
  });
  const events = useQuery({
    queryKey: ['health', batch.id, 'events'],
    queryFn: () => api<Page<HealthEvent>>(`${base}/health-events?batchId=${batch.id}&pageSize=50`),
  });

  const post = (path: string, body: object, method = 'POST') =>
    api(`${batchUrl}${path}`, { method, body: JSON.stringify(body) });
  const schedule = useMutation({
    mutationFn: (body: object) => post('/vaccinations', body),
    onSuccess: refresh,
  });
  const outcome = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      post(`/vaccinations/${id}/outcome`, body),
    onSuccess: refresh,
  });
  const recordEvent = useMutation({
    mutationFn: (body: object) => post('/health-events', body),
    onSuccess: refresh,
  });
  const updateEvent = useMutation({
    mutationFn: ({ id, resolutionStatus }: { id: string; resolutionStatus: ResolutionStatus }) =>
      post(`/health-events/${id}`, { resolutionStatus }, 'PATCH'),
    onSuccess: refresh,
  });

  const canSchedule = canRecord && (batch.status === 'PLANNED' || batch.status === 'ACTIVE');
  const canObserve = canRecord && (batch.status === 'ACTIVE' || batch.status === 'DEPLETED');

  function onSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    schedule.mutate(
      { vaccineId: data.get('vaccineId'), scheduledDate: data.get('scheduledDate') },
      { onSuccess: () => form.reset() },
    );
  }

  function onRecordEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    recordEvent.mutate(
      {
        category: data.get('category'),
        severity: data.get('severity'),
        description: data.get('description'),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <section aria-labelledby="health" className="flex flex-col gap-6">
      <h2 id="health" className="text-lg font-medium">
        Health
      </h2>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-zinc-500">Vaccinations</h3>
        <ErrorMessage error={vaccinations.error ?? outcome.error} />
        {vaccinations.data?.total === 0 && <p className="text-sm text-zinc-500">None scheduled.</p>}
        {vaccinations.data && vaccinations.data.items.length > 0 && (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {vaccinations.data.items.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <span>
                  <strong>{v.vaccine.name}</strong> · {formatDate(v.scheduledDate)}
                  {v.overdue && <span className="ml-2 text-red-600">overdue</span>}
                </span>
                {v.status === 'SCHEDULED' && canRecord && batch.status === 'ACTIVE' ? (
                  <span className="flex gap-3">
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        outcome.mutate({
                          id: v.id,
                          body: {
                            status: 'ADMINISTERED',
                            scheduleNext: Boolean(v.vaccine.recommendedIntervalDays),
                          },
                        })
                      }
                    >
                      Given today
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => outcome.mutate({ id: v.id, body: { status: 'MISSED' } })}
                    >
                      Missed
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => outcome.mutate({ id: v.id, body: { status: 'CANCELLED' } })}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    {humanize(v.status)}
                    {v.administeredAt && ` ${formatDateTime(v.administeredAt)}`}
                    {v.recorder && ` by ${v.recorder.name}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canSchedule && (
          <form onSubmit={onSchedule} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {vaccines.data?.length === 0 ? (
              <p className="text-sm text-zinc-500">Add a vaccine before scheduling.</p>
            ) : (
              <>
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Vaccine
                  <select name="vaccineId" className="input">
                    {vaccines.data?.map((vaccine) => (
                      <option key={vaccine.id} value={vaccine.id}>
                        {vaccine.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Date
                  <input
                    name="scheduledDate"
                    type="date"
                    required
                    min={batch.placementDate.slice(0, 10)}
                    className="input"
                  />
                </label>
                <button type="submit" disabled={schedule.isPending} className="btn-primary">
                  Schedule
                </button>
              </>
            )}
          </form>
        )}
        <ErrorMessage error={schedule.error} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-zinc-500">Observations</h3>
        <ErrorMessage error={events.error ?? updateEvent.error} />
        {events.data?.total === 0 && <p className="text-sm text-zinc-500">None recorded.</p>}
        {events.data && events.data.items.length > 0 && (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {events.data.items.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <strong>{humanize(e.category)}</strong> · {humanize(e.severity)} severity ·{' '}
                    {formatDateTime(e.observedAt)} · {e.recorder.name}
                  </span>
                  {canRecord && batch.status !== 'CLOSED' ? (
                    <select
                      aria-label="Resolution status"
                      className="input py-1 text-sm"
                      value={e.resolutionStatus}
                      onChange={(event) =>
                        updateEvent.mutate({
                          id: e.id,
                          resolutionStatus: event.target.value as ResolutionStatus,
                        })
                      }
                    >
                      {RESOLUTION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {humanize(status)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-zinc-500">{humanize(e.resolutionStatus)}</span>
                  )}
                </div>
                <p className="text-zinc-600 dark:text-zinc-400">{e.description}</p>
              </li>
            ))}
          </ul>
        )}
        {canObserve && (
          <form onSubmit={onRecordEvent} className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              Category
              <select name="category" className="input">
                {HEALTH_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {humanize(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Severity
              <select name="severity" defaultValue="MEDIUM" className="input">
                {SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {humanize(severity)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              What did you see?
              <input name="description" required minLength={3} maxLength={2000} className="input" />
            </label>
            <div>
              <button type="submit" disabled={recordEvent.isPending} className="btn-primary">
                Record observation
              </button>
            </div>
          </form>
        )}
        <ErrorMessage error={recordEvent.error} />
      </div>
    </section>
  );
}
