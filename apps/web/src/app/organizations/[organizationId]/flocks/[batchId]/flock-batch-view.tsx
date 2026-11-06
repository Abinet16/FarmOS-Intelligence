'use client';

import { BATCH_TRANSITIONS, type BatchStatus } from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { StatusBadge } from '@/components/status-badge';
import { api, type FlockBatch } from '@/lib/api';
import { formatCount, formatDate, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

const ACTION_LABELS: Record<BatchStatus, string> = {
  PLANNED: 'Plan',
  ACTIVE: 'Place birds',
  DEPLETED: 'Mark depleted',
  CLOSED: 'Close batch',
};

export function FlockBatchView() {
  const { batchId } = useParams<{ batchId: string }>();
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;
  const [depletionDate, setDepletionDate] = useState('');

  const batch = useQuery({
    queryKey: ['flock-batches', organization.id, batchId],
    queryFn: () => api<FlockBatch>(`${base}/flock-batches/${batchId}`),
  });

  const changeStatus = useMutation({
    mutationFn: (input: { status: BatchStatus; date?: string }) =>
      api<FlockBatch>(`${base}/flock-batches/${batchId}/status`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flock-batches', organization.id] }),
        queryClient.invalidateQueries({ queryKey: ['houses', organization.id] }),
      ]),
  });

  if (batch.isPending) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (batch.error) return <ErrorMessage error={batch.error} />;

  const b = batch.data;
  const next = BATCH_TRANSITIONS[b.status];

  function onTransition(status: BatchStatus) {
    if (status === 'CLOSED' && b.status === 'PLANNED' && !confirm('Cancel this planned flock?')) {
      return;
    }
    changeStatus.mutate({
      status,
      ...(status === 'DEPLETED' && depletionDate && { date: depletionDate }),
    });
  }

  const facts: [string, string][] = [
    ['Farm / house', `${b.house.farm.name} / ${b.house.name}`],
    ['Breed', b.breed],
    ['Purpose', humanize(b.purpose)],
    ['Birds placed', formatCount(b.initialBirds)],
    ['Placement date', formatDate(b.placementDate)],
    ['End date', formatDate(b.endDate)],
    ['Age', b.ageDays === null ? '—' : `${b.ageDays} days`],
  ];

  return (
    <>
      <div>
        <Link href={`${base}/flocks`} className="text-xs text-zinc-500 hover:underline">
          Flocks
        </Link>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          {b.batchCode} <StatusBadge status={b.status} />
        </h1>
      </div>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-4 border-b border-zinc-100 py-1 dark:border-zinc-900"
          >
            <dt className="text-sm text-zinc-500">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {b.notes && <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.notes}</p>}

      {canConfigure && next.length > 0 && (
        <section aria-labelledby="lifecycle" className="flex flex-col gap-3">
          <h2 id="lifecycle" className="text-lg font-medium">
            Lifecycle
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            {next.includes('DEPLETED') && (
              <label className="flex flex-col gap-1 text-sm">
                Depletion date <span className="text-zinc-500">(defaults to today)</span>
                <input
                  type="date"
                  className="input"
                  value={depletionDate}
                  onChange={(event) => setDepletionDate(event.target.value)}
                />
              </label>
            )}
            {next.map((status) => (
              <button
                key={status}
                type="button"
                disabled={changeStatus.isPending}
                className={
                  status === 'CLOSED' && b.status === 'PLANNED' ? 'btn-secondary' : 'btn-primary'
                }
                onClick={() => onTransition(status)}
              >
                {status === 'CLOSED' && b.status === 'PLANNED'
                  ? 'Cancel flock'
                  : ACTION_LABELS[status]}
              </button>
            ))}
          </div>
          <ErrorMessage error={changeStatus.error} />
        </section>
      )}
    </>
  );
}
