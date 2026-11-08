'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/error-message';
import { api, type FlockBatch, type FlockRecords } from '@/lib/api';
import { formatCount, formatDate, formatNumber, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

type Kind = 'mortality' | 'feed-usage' | 'weight-samples';

interface Row {
  kind: Kind;
  id: string;
  date: string;
  label: string;
  detail: string;
  recorder: string;
  voidedAt: string | null;
  voidReason: string | null;
  voider: string | null;
}

/**
 * Deaths, feed and weight records. They are never edited: a reviewer voids a
 * wrong one with a reason (it stays listed, struck through) and the right
 * value is entered again.
 */
export function RecentRecords({ batch }: { batch: FlockBatch }) {
  const organization = useOrganization();
  const canVoid = useCan('production:approve-correction');
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}/flock-batches/${batch.id}`;

  const records = useQuery({
    queryKey: ['flock-records', batch.id, 'records'],
    queryFn: () => api<FlockRecords>(`${base}/records`),
    enabled: batch.status !== 'PLANNED',
  });

  const voidRecord = useMutation({
    mutationFn: ({ kind, id, reason }: { kind: Kind; id: string; reason: string }) =>
      api(`${base}/${kind}/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flock-records', batch.id] }),
        queryClient.invalidateQueries({ queryKey: ['flock-batches', organization.id] }),
      ]),
  });

  if (!records.data) return <ErrorMessage error={records.error} />;

  const rows: Row[] = [
    ...records.data.mortality.map((m) => ({
      kind: 'mortality' as const,
      id: m.id,
      date: m.eventDate,
      label: `${formatCount(m.quantity)} deaths`,
      detail: humanize(m.reasonCode),
      recorder: m.recorder.name,
      voidedAt: m.voidedAt,
      voidReason: m.voidReason,
      voider: m.voider?.name ?? null,
    })),
    ...records.data.feed.map((f) => ({
      kind: 'feed-usage' as const,
      id: f.id,
      date: f.usageDate,
      label: `${formatNumber(f.quantityKg, 1)} kg feed`,
      detail: f.feedType.name,
      recorder: f.recorder.name,
      voidedAt: f.voidedAt,
      voidReason: f.voidReason,
      voider: f.voider?.name ?? null,
    })),
    ...records.data.weightSamples.map((w) => ({
      kind: 'weight-samples' as const,
      id: w.id,
      date: w.sampleDate,
      label: `${formatNumber(w.averageWeightGrams, 0)} g average`,
      detail: `${w.sampleSize} birds weighed`,
      recorder: w.recorder.name,
      voidedAt: w.voidedAt,
      voidReason: w.voidReason,
      voider: w.voider?.name ?? null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) return null;

  function onVoid(row: Row) {
    const reason = window.prompt(`Why is "${row.label}" on ${formatDate(row.date)} wrong?`);
    if (reason && reason.trim().length >= 3) {
      voidRecord.mutate({ kind: row.kind, id: row.id, reason: reason.trim() });
    }
  }

  return (
    <section aria-labelledby="recent-records" className="flex flex-col gap-3">
      <h2 id="recent-records" className="text-lg font-medium">
        Deaths, feed and weights
      </h2>
      <ErrorMessage error={voidRecord.error} />
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.slice(0, 30).map((row) => (
              <tr key={row.id} className={row.voidedAt ? 'text-zinc-400' : undefined}>
                <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(row.date)}</td>
                <td className={`px-3 py-1.5 ${row.voidedAt ? 'line-through' : 'font-medium'}`}>
                  {row.label}
                </td>
                <td className="px-3 py-1.5">{row.detail}</td>
                <td className="px-3 py-1.5">{row.recorder}</td>
                <td className="px-3 py-1.5 text-right">
                  {row.voidedAt ? (
                    <span title={row.voidReason ?? undefined}>
                      Voided by {row.voider}: {row.voidReason}
                    </span>
                  ) : (
                    canVoid &&
                    batch.status !== 'CLOSED' && (
                      <button
                        type="button"
                        className="text-sm underline"
                        disabled={voidRecord.isPending}
                        onClick={() => onVoid(row)}
                      >
                        Void
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
