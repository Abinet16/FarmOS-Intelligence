'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

/** Unread count in the header, refreshed every minute and when the tab regains focus. */
export function NotificationBell({ organizationId }: { organizationId: string }) {
  const count = useQuery({
    queryKey: ['notifications', organizationId, 'unread-count'],
    queryFn: () =>
      api<{ unread: number }>(`/organizations/${organizationId}/notifications/unread-count`),
    refetchInterval: 60_000,
  });
  const unread = count.data?.unread ?? 0;
  return (
    <Link
      href={`/organizations/${organizationId}/notifications`}
      className="relative rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M10 2a6 6 0 0 0-6 6v3.6l-1.7 2.6A.75.75 0 0 0 3 15.4h14a.75.75 0 0 0 .7-1.2L16 11.6V8a6 6 0 0 0-6-6Zm-2.5 14.4a2.5 2.5 0 0 0 5 0h-5Z" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-medium text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
