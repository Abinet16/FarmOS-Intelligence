'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/error-message';
import { api, queryString, type AuditLogPage } from '@/lib/api';
import { describeAction, formatDateTime, humanize } from '@/lib/format';
import { useOrganization } from '@/lib/organization-context';

const PAGE_SIZE = 50;

/**
 * The organization's append-only history, newest first. Entries can't be
 * edited or deleted, by anyone; the database rejects it.
 */
export function AuditView() {
  const organization = useOrganization();
  const log = useInfiniteQuery({
    queryKey: ['audit-logs', organization.id],
    queryFn: ({ pageParam }) =>
      api<AuditLogPage>(
        `/organizations/${organization.id}/audit-logs${queryString({
          limit: PAGE_SIZE,
          before: pageParam ?? '',
        })}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const entries = log.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-zinc-500">
          Every change in this organization, who made it and when. Entries can’t be edited or
          deleted.
        </p>
      </div>

      <ErrorMessage error={log.error} />
      {log.isSuccess && entries.length === 0 && <p className="text-zinc-500">Nothing yet.</p>}
      {entries.length > 0 && (
        <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{describeAction(entry.action)}</span>
                <time dateTime={entry.createdAt} className="text-zinc-500">
                  {formatDateTime(entry.createdAt)}
                </time>
              </div>
              <p className="text-zinc-500">
                {entry.actor ? `${entry.actor.name} (${entry.actor.email})` : 'System'} ·{' '}
                {humanize(entry.entityType)}
              </p>
              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-500">Details</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {log.hasNextPage && (
        <button
          type="button"
          className="btn-secondary self-start"
          disabled={log.isFetchingNextPage}
          onClick={() => log.fetchNextPage()}
        >
          {log.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
        </button>
      )}
    </>
  );
}
