'use client';

import { BATCH_STATUSES, FLOCK_PURPOSES, type BatchStatus } from '@farmos/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Pagination } from '@/components/pagination';
import { StatusBadge } from '@/components/status-badge';
import { api, queryString, type FlockBatch, type House, type Page } from '@/lib/api';
import { formatCount, formatDate, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

export default function FlocksPage() {
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BatchStatus | ''>('');
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());

  const batches = useQuery({
    queryKey: ['flock-batches', organization.id, { q, status, page }],
    queryFn: () =>
      api<Page<FlockBatch>>(
        `${base}/flock-batches${queryString({ q, status, page, pageSize: 20 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // Placement options; organizations rarely have more than a hundred houses.
  const houses = useQuery({
    queryKey: ['houses', organization.id, { pageSize: 100 }],
    queryFn: () => api<Page<House>>(`${base}/houses${queryString({ pageSize: 100 })}`),
    enabled: canConfigure,
  });

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<FlockBatch>(`${base}/flock-batches`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['flock-batches', organization.id] }),
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const notes = String(data.get('notes')).trim();
    create.mutate(
      {
        houseId: data.get('houseId'),
        batchCode: data.get('batchCode'),
        breed: data.get('breed'),
        purpose: data.get('purpose'),
        placementDate: data.get('placementDate'),
        initialBirds: Number(data.get('initialBirds')),
        ...(notes && { notes }),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Flocks</h1>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by status"
            className="input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as BatchStatus | '');
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {BATCH_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Search flocks"
            placeholder="Search batch code or breed"
            className="input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <ErrorMessage error={batches.error} />

      {batches.data?.total === 0 && (
        <p className="text-zinc-600 dark:text-zinc-400">
          {q || status ? 'No flocks match these filters.' : 'No flocks yet.'}
        </p>
      )}

      {batches.data && batches.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Batch</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Placed</th>
                <th className="px-4 py-2 text-right font-medium">Birds</th>
                <th className="px-4 py-2 text-right font-medium">Age (days)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {batches.data.items.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-4 py-2">
                    <Link
                      href={`${base}/flocks/${batch.id}`}
                      className="font-medium hover:underline"
                    >
                      {batch.batchCode}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {batch.breed} · {humanize(batch.purpose)}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {batch.house.farm.name} / {batch.house.name}
                  </td>
                  <td className="px-4 py-2">{formatDate(batch.placementDate)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCount(batch.initialBirds)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{batch.ageDays ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {batches.data && <Pagination page={batches.data} onChange={setPage} />}

      {canConfigure && (
        <section aria-labelledby="plan-batch" className="flex flex-col gap-3">
          <h2 id="plan-batch" className="text-lg font-medium">
            Plan a new flock
          </h2>
          {houses.data?.total === 0 ? (
            <p className="text-sm text-zinc-500">Add a house to a farm before planning a flock.</p>
          ) : (
            <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                House
                <select name="houseId" required className="input">
                  {houses.data?.items.map((house) => (
                    <option key={house.id} value={house.id}>
                      {house.farm.name} / {house.name} (cap. {formatCount(house.capacity)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Batch code
                <input name="batchCode" required maxLength={40} className="input" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Breed
                <input name="breed" required minLength={2} maxLength={80} className="input" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Purpose
                <select name="purpose" className="input">
                  {FLOCK_PURPOSES.map((value) => (
                    <option key={value} value={value}>
                      {humanize(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Placement date
                <input name="placementDate" type="date" required className="input" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Birds placed
                <input
                  name="initialBirds"
                  type="number"
                  required
                  min={1}
                  max={1000000}
                  className="input"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                Notes <span className="text-zinc-500">(optional)</span>
                <input name="notes" maxLength={2000} className="input" />
              </label>
              <div className="flex items-end">
                <button type="submit" disabled={create.isPending} className="btn-primary">
                  {create.isPending ? 'Saving…' : 'Plan flock'}
                </button>
              </div>
            </form>
          )}
          <ErrorMessage error={create.error ?? houses.error} />
        </section>
      )}
    </>
  );
}
