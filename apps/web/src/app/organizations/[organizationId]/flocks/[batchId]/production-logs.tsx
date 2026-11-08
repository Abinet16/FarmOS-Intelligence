'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, type FlockBatch, type FlockRecords, type ProductionLog } from '@/lib/api';
import { formatCount, formatDate, formatNumber, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

/**
 * Recent production logs. Supervisors and above approve them; once approved,
 * changes are proposed as corrections and reviewed by someone else.
 */
export function ProductionLogs({ batch }: { batch: FlockBatch }) {
  const organization = useOrganization();
  const canApprove = useCan('production:approve-correction');
  const canRecord = useCan('production:record');
  const [correcting, setCorrecting] = useState<ProductionLog | null>(null);
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}/flock-batches/${batch.id}`;

  const records = useQuery({
    queryKey: ['flock-records', batch.id, 'records'],
    queryFn: () => api<FlockRecords>(`${base}/records`),
    enabled: batch.status !== 'PLANNED',
  });

  const approve = useMutation({
    mutationFn: (logId: string) =>
      api(`${base}/production-logs/${logId}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flock-records', batch.id] }),
  });

  const requestCorrection = useMutation({
    mutationFn: ({ logId, body }: { logId: string; body: object }) =>
      api(`${base}/production-logs/${logId}/corrections`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setCorrecting(null);
      return queryClient.invalidateQueries({ queryKey: ['corrections', organization.id] });
    },
  });

  function onRequestCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!correcting) return;
    const data = new FormData(event.currentTarget);
    requestCorrection.mutate({
      logId: correcting.id,
      body: {
        changes: { eggsCollected: Number(data.get('eggsCollected')) },
        reason: String(data.get('reason')),
      },
    });
  }

  if (batch.status === 'PLANNED' || records.data?.productionLogs.length === 0) return null;

  return (
    <section aria-labelledby="production-logs" className="flex flex-col gap-3">
      <h2 id="production-logs" className="text-lg font-medium">
        Production logs
      </h2>
      <ErrorMessage error={records.error ?? approve.error} />
      {correcting && (
        <form
          onSubmit={onRequestCorrection}
          className="flex flex-col gap-3 rounded-lg border border-amber-300 p-4 sm:flex-row sm:items-end dark:border-amber-800"
        >
          <p className="text-sm sm:w-48">
            Correct the log for <strong>{formatDate(correcting.logDate)}</strong>. A reviewer must
            approve it.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Eggs collected
            <input
              name="eggsCollected"
              type="number"
              min={0}
              required
              defaultValue={correcting.eggsCollected}
              className="input"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Reason
            <input name="reason" required minLength={3} maxLength={500} className="input" />
          </label>
          <button type="submit" disabled={requestCorrection.isPending} className="btn-primary">
            Request
          </button>
          <button type="button" className="btn-secondary" onClick={() => setCorrecting(null)}>
            Cancel
          </button>
        </form>
      )}
      <ErrorMessage error={requestCorrection.error} />
      {records.data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Eggs</th>
                <th className="px-3 py-2 text-right font-medium">Water L</th>
                <th className="px-3 py-2 font-medium">Recorded by</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {records.data.productionLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-1.5">{formatDate(log.logDate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatCount(log.eggsCollected)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatNumber(log.waterLitres, 1)}
                  </td>
                  <td className="px-3 py-1.5">{log.creator.name}</td>
                  <td className="px-3 py-1.5">
                    {log.status === 'APPROVED' ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Approved by {log.approver?.name}
                        {canRecord && batch.status !== 'CLOSED' && (
                          <button
                            type="button"
                            className="ml-3 text-sm text-zinc-600 underline dark:text-zinc-400"
                            onClick={() => setCorrecting(log)}
                          >
                            Request correction
                          </button>
                        )}
                      </span>
                    ) : canApprove && batch.status !== 'CLOSED' ? (
                      <button
                        type="button"
                        className="text-sm underline"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(log.id)}
                      >
                        Approve
                      </button>
                    ) : (
                      humanize(log.status)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
