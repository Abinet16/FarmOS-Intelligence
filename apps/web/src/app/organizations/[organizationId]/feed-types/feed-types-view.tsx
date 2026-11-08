'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, type FeedType, type Vaccine } from '@/lib/api';
import { useCan, useOrganization } from '@/lib/organization-context';

export function FeedTypesView() {
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
  const canRecordHealth = useCan('health:record');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;

  const feedTypes = useQuery({
    queryKey: ['feed-types', organization.id],
    queryFn: () => api<FeedType[]>(`${base}/feed-types`),
  });

  const create = useMutation({
    mutationFn: (name: string) =>
      api<FeedType>(`${base}/feed-types`, { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed-types', organization.id] }),
  });

  const vaccines = useQuery({
    queryKey: ['vaccines', organization.id],
    queryFn: () => api<Vaccine[]>(`${base}/vaccines`),
  });

  const createVaccine = useMutation({
    mutationFn: (input: { name: string; recommendedIntervalDays: number | null }) =>
      api<Vaccine>(`${base}/vaccines`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vaccines', organization.id] }),
  });

  function onCreateVaccine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const interval = String(data.get('interval')).trim();
    createVaccine.mutate(
      {
        name: String(data.get('name')),
        recommendedIntervalDays: interval ? Number(interval) : null,
      },
      { onSuccess: () => form.reset() },
    );
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    create.mutate(String(new FormData(form).get('name')), { onSuccess: () => form.reset() });
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feed types</h1>
        <p className="text-sm text-zinc-500">Feed is always recorded in kilograms.</p>
      </div>

      <ErrorMessage error={feedTypes.error} />
      {feedTypes.data?.length === 0 && <p className="text-zinc-500">No feed types yet.</p>}
      {feedTypes.data && feedTypes.data.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {feedTypes.data.map((feedType) => (
            <li key={feedType.id} className="px-4 py-2 text-sm">
              {feedType.name}
            </li>
          ))}
        </ul>
      )}

      {canConfigure && (
        <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            New feed type
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="e.g. Layer mash"
              className="input"
            />
          </label>
          <button type="submit" disabled={create.isPending} className="btn-primary">
            Add
          </button>
        </form>
      )}
      <ErrorMessage error={create.error} />

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Vaccines</h2>
        <p className="text-sm text-zinc-500">
          With a booster interval, giving a dose can schedule the next one.
        </p>
      </div>
      <ErrorMessage error={vaccines.error} />
      {vaccines.data?.length === 0 && <p className="text-zinc-500">No vaccines yet.</p>}
      {vaccines.data && vaccines.data.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {vaccines.data.map((vaccine) => (
            <li key={vaccine.id} className="flex justify-between px-4 py-2 text-sm">
              {vaccine.name}
              <span className="text-zinc-500">
                {vaccine.recommendedIntervalDays
                  ? `booster every ${vaccine.recommendedIntervalDays} days`
                  : 'single dose'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canRecordHealth && (
        <form onSubmit={onCreateVaccine} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            New vaccine
            <input name="name" required minLength={2} maxLength={120} className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Booster interval (days) <span className="text-zinc-500">(optional)</span>
            <input name="interval" type="number" min={1} max={730} className="input" />
          </label>
          <button type="submit" disabled={createVaccine.isPending} className="btn-primary">
            Add
          </button>
        </form>
      )}
      <ErrorMessage error={createVaccine.error} />
    </>
  );
}
