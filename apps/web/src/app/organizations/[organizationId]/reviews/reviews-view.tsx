'use client';

import { CORRECTION_STATUSES, type CorrectionStatus } from '@farmos/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Pagination } from '@/components/pagination';
import { api, queryString, type Correction, type Page } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

const FIELD_LABELS: Record<string, string> = {
  eggsCollected: 'Eggs',
  waterLitres: 'Water (L)',
  notes: 'Notes',
};

/** The correction review queue. Nobody can review their own request. */
export function ReviewsView() {
  const organization = useOrganization();
  const canReview = useCan('production:approve-correction');
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}`;
  const [status, setStatus] = useState<CorrectionStatus>('PENDING');
  const [page, setPage] = useState(1);

  const corrections = useQuery({
    queryKey: ['corrections', organization.id, { status, page }],
    queryFn: () =>
      api<Page<Correction>>(`${base}/corrections${queryString({ status, page, pageSize: 20 })}`),
    enabled: canReview,
    placeholderData: keepPreviousData,
  });

  const review = useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: 'approve' | 'reject';
      note?: string;
    }) =>
      api(`${base}/corrections/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(note ? { note } : {}),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['corrections', organization.id] }),
        queryClient.invalidateQueries({ queryKey: ['flock-records'] }),
      ]),
  });

  if (!canReview) {
    return <p className="text-zinc-500">Your role does not review corrections.</p>;
  }

  function onReject(id: string) {
    const note = window.prompt('Why are you rejecting this correction?');
    if (note && note.trim().length >= 3) review.mutate({ id, action: 'reject', note: note.trim() });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Corrections</h1>
          <p className="text-sm text-zinc-500">
            Changes to approved production logs, applied only once someone else approves them.
          </p>
        </div>
        <select
          aria-label="Filter by status"
          className="input"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as CorrectionStatus);
            setPage(1);
          }}
        >
          {CORRECTION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
      </div>

      <ErrorMessage error={corrections.error ?? review.error} />
      {corrections.data?.total === 0 && (
        <p className="text-zinc-500">No {humanize(status)} corrections.</p>
      )}

      <ul className="flex flex-col gap-3">
        {corrections.data?.items.map((c) => {
          const own = c.requester.id === session?.user.id;
          return (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  <Link
                    href={`${base}/flocks/${c.productionLog.batch.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.productionLog.batch.batchCode}
                  </Link>{' '}
                  · log for {formatDate(c.productionLog.logDate)}
                </span>
                <span className="text-zinc-500">
                  {c.requester.name}, {formatDateTime(c.createdAt)}
                </span>
              </div>
              <ul>
                {Object.entries(c.proposedChanges).map(([field, value]) => (
                  <li key={field}>
                    {FIELD_LABELS[field] ?? field}:{' '}
                    <span className="text-zinc-500 line-through">
                      {String(c.productionLog[field as keyof typeof c.productionLog] ?? '—')}
                    </span>{' '}
                    → <strong>{String(value ?? '—')}</strong>
                  </li>
                ))}
              </ul>
              <p className="text-zinc-600 dark:text-zinc-400">Reason: {c.reason}</p>
              {c.status === 'PENDING' ? (
                own ? (
                  <p className="text-zinc-500">Someone else must review your request.</p>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: c.id, action: 'approve' })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={review.isPending}
                      onClick={() => onReject(c.id)}
                    >
                      Reject
                    </button>
                  </div>
                )
              ) : (
                <p className="text-zinc-500">
                  {humanize(c.status)} by {c.reviewer?.name}
                  {c.reviewNote && `: ${c.reviewNote}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {corrections.data && <Pagination page={corrections.data} onChange={setPage} />}
    </>
  );
}
