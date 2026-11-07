'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, type FeedType } from '@/lib/api';
import { useCan, useOrganization } from '@/lib/organization-context';

export function FeedTypesView() {
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
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
    </>
  );
}
