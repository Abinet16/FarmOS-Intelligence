'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Pagination } from '@/components/pagination';
import { StatusBadge } from '@/components/status-badge';
import { api, queryString, type Farm, type Page } from '@/lib/api';
import { useCan, useOrganization } from '@/lib/organization-context';

export default function FarmsPage() {
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;

  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());

  const farms = useQuery({
    queryKey: ['farms', organization.id, { q, includeArchived, page }],
    queryFn: () =>
      api<Page<Farm>>(`${base}/farms${queryString({ q, includeArchived, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: (input: { name: string; location?: string }) =>
      api<Farm>(`${base}/farms`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['farms', organization.id] }),
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const location = String(data.get('location')).trim();
    create.mutate(
      { name: String(data.get('name')), ...(location && { location }) },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Farms</h1>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => {
                setIncludeArchived(event.target.checked);
                setPage(1);
              }}
            />
            Show archived
          </label>
          <input
            type="search"
            aria-label="Search farms"
            placeholder="Search name or location"
            className="input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <ErrorMessage error={farms.error} />

      {farms.data && farms.data.total === 0 && (
        <p className="text-zinc-600 dark:text-zinc-400">
          {q ? 'No farms match your search.' : 'No farms yet.'}
          {!q && canConfigure && ' Add the first one below.'}
        </p>
      )}

      {farms.data && farms.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 text-right font-medium">Houses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {farms.data.items.map((farm) => (
                <tr key={farm.id}>
                  <td className="px-4 py-2">
                    <Link href={`${base}/farms/${farm.id}`} className="font-medium hover:underline">
                      {farm.name}
                    </Link>{' '}
                    {farm.archivedAt && <StatusBadge status="ARCHIVED" />}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {farm.location ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{farm.houseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {farms.data && <Pagination page={farms.data} onChange={setPage} />}

      {canConfigure && (
        <section aria-labelledby="add-farm" className="flex flex-col gap-3">
          <h2 id="add-farm" className="text-lg font-medium">
            Add a farm
          </h2>
          <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Name
              <input name="name" required minLength={2} maxLength={120} className="input" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Location <span className="text-zinc-500">(optional)</span>
              <input name="location" maxLength={200} className="input" />
            </label>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              {create.isPending ? 'Adding…' : 'Add farm'}
            </button>
          </form>
          <ErrorMessage error={create.error} />
        </section>
      )}
    </>
  );
}
