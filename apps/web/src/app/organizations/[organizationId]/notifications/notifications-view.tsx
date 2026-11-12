'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Pagination } from '@/components/pagination';
import { api, queryString, type AppNotification, type Page } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useOrganization } from '@/lib/organization-context';
import { PreferencesForm } from './preferences-form';

/** The member's own inbox: new alerts and finished reports. */
export function NotificationsView() {
  const organization = useOrganization();
  const base = `/organizations/${organization.id}`;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const notifications = useQuery({
    queryKey: ['notifications', organization.id, { unreadOnly, page }],
    queryFn: () =>
      api<Page<AppNotification>>(
        `${base}/notifications${queryString({ unread: unreadOnly || undefined, page, pageSize: 20 })}`,
      ),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['notifications', organization.id] });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api<AppNotification>(`${base}/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => api<{ marked: number }>(`${base}/notifications/read-all`, { method: 'POST' }),
    onSuccess: refresh,
  });

  async function open(notification: AppNotification) {
    if (!notification.readAt) await markRead.mutateAsync(notification.id);
    if (notification.link) router.push(`${base}${notification.link}`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => {
                setUnreadOnly(event.target.checked);
                setPage(1);
              }}
            />
            Unread only
          </label>
          <button
            type="button"
            className="btn-secondary"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </button>
        </div>
      </div>
      <ErrorMessage error={notifications.error ?? markRead.error ?? markAll.error} />

      {notifications.data && notifications.data.items.length === 0 && (
        <p className="text-sm text-zinc-500">
          {unreadOnly ? 'Nothing unread.' : 'No notifications yet.'}
        </p>
      )}
      {notifications.data && notifications.data.items.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {notifications.data.items.map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => open(notification)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    notification.readAt ? 'bg-transparent' : 'bg-sky-600'
                  }`}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={`text-sm ${notification.readAt ? '' : 'font-medium'}`}>
                    {notification.title}
                    {!notification.readAt && <span className="sr-only"> (unread)</span>}
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {notification.body}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(notification.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {notifications.data && <Pagination page={notifications.data} onChange={setPage} />}

      <section aria-labelledby="email-preferences" className="flex flex-col gap-3">
        <h2 id="email-preferences" className="text-lg font-medium">
          Email
        </h2>
        <PreferencesForm organizationId={organization.id} />
      </section>
    </>
  );
}
