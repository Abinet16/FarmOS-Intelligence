'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { StatusBadge } from '@/components/status-badge';
import { api, queryString, type Farm, type House, type Page } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

export function FarmView() {
  const { farmId } = useParams<{ farmId: string }>();
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;
  const [editing, setEditing] = useState(false);

  const farm = useQuery({
    queryKey: ['farms', organization.id, farmId],
    queryFn: () => api<Farm>(`${base}/farms/${farmId}`),
  });
  const houses = useQuery({
    queryKey: ['houses', organization.id, { farmId }],
    queryFn: () =>
      api<Page<House>>(
        `${base}/houses${queryString({ farmId, includeArchived: true, pageSize: 100 })}`,
      ),
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['farms', organization.id] }),
      queryClient.invalidateQueries({ queryKey: ['houses', organization.id] }),
    ]);

  const updateFarm = useMutation({
    mutationFn: (input: { name: string; location: string | null }) =>
      api<Farm>(`${base}/farms/${farmId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      setEditing(false);
      return refresh();
    },
  });
  const archiveFarm = useMutation({
    mutationFn: (action: 'archive' | 'restore') =>
      api<Farm>(`${base}/farms/${farmId}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const addHouse = useMutation({
    mutationFn: (input: { name: string; capacity: number }) =>
      api<House>(`${base}/houses`, {
        method: 'POST',
        body: JSON.stringify({ farmId, ...input }),
      }),
    onSuccess: refresh,
  });
  const archiveHouse = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'archive' | 'restore' }) =>
      api<House>(`${base}/houses/${id}/${action}`, { method: 'POST' }),
    onSuccess: refresh,
  });

  function onEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const location = String(data.get('location')).trim();
    updateFarm.mutate({ name: String(data.get('name')), location: location || null });
  }

  function onAddHouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    addHouse.mutate(
      { name: String(data.get('name')), capacity: Number(data.get('capacity')) },
      { onSuccess: () => form.reset() },
    );
  }

  if (farm.isPending) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (farm.error) return <ErrorMessage error={farm.error} />;

  const archived = Boolean(farm.data.archivedAt);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`${base}/farms`} className="text-xs text-zinc-500 hover:underline">
            Farms
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {farm.data.name} {archived && <StatusBadge status="ARCHIVED" />}
          </h1>
          <p className="text-sm text-zinc-500">{farm.data.location ?? 'No location set'}</p>
        </div>
        {canConfigure && (
          <div className="flex gap-2">
            {!archived && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(!editing)}>
                {editing ? 'Cancel' : 'Edit'}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={archiveFarm.isPending}
              onClick={() => archiveFarm.mutate(archived ? 'restore' : 'archive')}
            >
              {archived ? 'Restore farm' : 'Archive farm'}
            </button>
          </div>
        )}
      </div>

      <ErrorMessage error={archiveFarm.error ?? archiveHouse.error} />

      {editing && (
        <form onSubmit={onEdit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={farm.data.name}
              className="input"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Location
            <input
              name="location"
              maxLength={200}
              defaultValue={farm.data.location ?? ''}
              className="input"
            />
          </label>
          <button type="submit" disabled={updateFarm.isPending} className="btn-primary">
            Save
          </button>
          <ErrorMessage error={updateFarm.error} />
        </form>
      )}

      <section aria-labelledby="houses" className="flex flex-col gap-3">
        <h2 id="houses" className="text-lg font-medium">
          Houses
        </h2>
        <ErrorMessage error={houses.error} />
        {houses.data?.total === 0 && <p className="text-zinc-500">No houses yet.</p>}
        {houses.data && houses.data.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 font-medium">House</th>
                  <th className="px-4 py-2 text-right font-medium">Capacity</th>
                  <th className="px-4 py-2 font-medium">Current flock</th>
                  {canConfigure && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {houses.data.items.map((house) => (
                  <tr key={house.id}>
                    <td className="px-4 py-2 font-medium">
                      {house.name} {house.archivedAt && <StatusBadge status="ARCHIVED" />}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCount(house.capacity)}
                    </td>
                    <td className="px-4 py-2">
                      {house.activeBatch ? (
                        <Link
                          href={`${base}/flocks/${house.activeBatch.id}`}
                          className="hover:underline"
                        >
                          {house.activeBatch.batchCode} ·{' '}
                          {formatCount(house.activeBatch.initialBirds)} birds
                        </Link>
                      ) : (
                        <span className="text-zinc-500">Empty</span>
                      )}
                    </td>
                    {canConfigure && (
                      <td className="px-4 py-2 text-right">
                        {!archived && (
                          <button
                            type="button"
                            className="text-sm underline"
                            onClick={() =>
                              archiveHouse.mutate({
                                id: house.id,
                                action: house.archivedAt ? 'restore' : 'archive',
                              })
                            }
                          >
                            {house.archivedAt ? 'Restore' : 'Archive'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canConfigure && !archived && (
          <form onSubmit={onAddHouse} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              House name
              <input name="name" required maxLength={60} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Capacity (birds)
              <input
                name="capacity"
                type="number"
                required
                min={1}
                max={1000000}
                className="input"
              />
            </label>
            <button type="submit" disabled={addHouse.isPending} className="btn-primary">
              Add house
            </button>
          </form>
        )}
        <ErrorMessage error={addHouse.error} />
      </section>
    </>
  );
}
