'use client';

import { MORTALITY_REASONS } from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, type FeedType, type FlockBatch } from '@/lib/api';
import { humanize, todayIn } from '@/lib/format';
import { useOrganization } from '@/lib/organization-context';

/**
 * One form for a day's records. Every section is optional: fill in what you
 * have now (say, a midday mortality count) and the rest later.
 */
export function DailyEntryForm({ batch }: { batch: FlockBatch }) {
  const organization = useOrganization();
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;
  const laying = batch.purpose !== 'BROILER';
  const today = todayIn(organization.timezone);
  const maxDate =
    batch.endDate && batch.endDate.slice(0, 10) < today ? batch.endDate.slice(0, 10) : today;

  const feedTypes = useQuery({
    queryKey: ['feed-types', organization.id],
    queryFn: () => api<FeedType[]>(`${base}/feed-types`),
  });

  const record = useMutation({
    mutationFn: (entry: Record<string, unknown>) =>
      api(`${base}/flock-batches/${batch.id}/daily-entries`, {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flock-batches', organization.id] }),
        queryClient.invalidateQueries({ queryKey: ['flock-records', batch.id] }),
      ]),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const num = (name: string) => {
      const value = String(data.get(name) ?? '').trim();
      return value === '' ? undefined : Number(value);
    };
    const text = (name: string) => String(data.get(name) ?? '').trim() || undefined;

    const deaths = num('deaths');
    const feedKg = num('feedKg');
    const sampleSize = num('sampleSize');
    const averageWeightGrams = num('averageWeightGrams');

    record.mutate(
      {
        date: data.get('date'),
        eggsCollected: num('eggsCollected'),
        waterLitres: num('waterLitres'),
        notes: text('notes'),
        deaths: deaths ? [{ quantity: deaths, reasonCode: data.get('reasonCode') }] : [],
        feed: feedKg ? [{ feedTypeId: data.get('feedTypeId'), quantityKg: feedKg }] : [],
        weight: sampleSize && averageWeightGrams ? { sampleSize, averageWeightGrams } : undefined,
      },
      { onSuccess: () => form.reset() },
    );
  }

  const noFeedTypes = feedTypes.data?.length === 0;

  return (
    <section aria-labelledby="daily-entry" className="flex flex-col gap-3">
      <h2 id="daily-entry" className="text-lg font-medium">
        Record a day
      </h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={maxDate}
              min={batch.placementDate.slice(0, 10)}
              max={maxDate}
              className="input"
            />
          </label>
          {laying && (
            <label className="flex flex-col gap-1 text-sm">
              Eggs collected
              <input name="eggsCollected" type="number" min={0} className="input" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            Water (litres)
            <input name="waterLitres" type="number" min={0} step="0.01" className="input" />
          </label>
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-2 text-sm font-medium text-zinc-500">Mortality</legend>
          <label className="flex flex-col gap-1 text-sm">
            Deaths
            <input name="deaths" type="number" min={1} className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Cause
            <select name="reasonCode" defaultValue="UNKNOWN" className="input">
              {MORTALITY_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {humanize(reason)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-2 text-sm font-medium text-zinc-500">Feed</legend>
          {noFeedTypes ? (
            <p className="text-sm text-zinc-500 sm:col-span-4">
              Add a feed type before recording feed.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                Feed type
                <select name="feedTypeId" className="input">
                  {feedTypes.data?.map((feedType) => (
                    <option key={feedType.id} value={feedType.id}>
                      {feedType.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Quantity (kg)
                <input name="feedKg" type="number" min={0.001} step="0.001" className="input" />
              </label>
            </>
          )}
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-2 text-sm font-medium text-zinc-500">Weight sample</legend>
          <label className="flex flex-col gap-1 text-sm">
            Birds weighed
            <input name="sampleSize" type="number" min={1} className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Average weight (g)
            <input name="averageWeightGrams" type="number" min={1} step="0.1" className="input" />
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          Notes <span className="text-zinc-500">(optional, saved with the production log)</span>
          <input name="notes" maxLength={2000} className="input" />
        </label>

        <div>
          <button type="submit" disabled={record.isPending} className="btn-primary">
            {record.isPending ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </form>
      <ErrorMessage error={record.error} />
      {record.isSuccess && <p className="text-sm text-emerald-700">Saved.</p>}
    </section>
  );
}
