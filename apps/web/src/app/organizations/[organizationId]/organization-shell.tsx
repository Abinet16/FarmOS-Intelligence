'use client';

import { hasPermission, type Permission } from '@farmos/shared-types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, ApiError, type Organization } from '@/lib/api';
import { humanize } from '@/lib/format';
import { OrganizationProvider } from '@/lib/organization-context';

const SECTIONS: { href: string; label: string; permission?: Permission }[] = [
  { href: 'dashboard', label: 'Dashboard' },
  { href: 'assistant', label: 'Assistant', permission: 'ai:query' },
  { href: 'farms', label: 'Farms & houses' },
  { href: 'flocks', label: 'Flocks' },
  { href: 'inventory', label: 'Inventory' },
  // Every role has at least one report (field workers: their own entries).
  { href: 'reports', label: 'Reports' },
  { href: 'reviews', label: 'Reviews', permission: 'production:approve-correction' },
  { href: 'feed-types', label: 'Feed & vaccines' },
];

export function OrganizationShell({ children }: { children: ReactNode }) {
  const { organizationId } = useParams<{ organizationId: string }>();
  const pathname = usePathname();
  const router = useRouter();

  const organization = useQuery({
    queryKey: ['organizations', organizationId],
    queryFn: () => api<Organization>(`/organizations/${organizationId}`),
  });

  const unauthenticated =
    organization.error instanceof ApiError && organization.error.status === 401;
  useEffect(() => {
    if (unauthenticated) router.replace('/sign-in');
  }, [unauthenticated, router]);

  if (organization.isPending || unauthenticated) {
    return <p className="p-8 text-sm text-zinc-500">Loading…</p>;
  }
  if (organization.error) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <ErrorMessage
          error={
            organization.error instanceof ApiError && organization.error.status === 404
              ? new Error('Organization not found, or you are not a member.')
              : organization.error
          }
        />
        <Link href="/organizations" className="text-sm underline">
          Back to your organizations
        </Link>
      </main>
    );
  }

  const base = `/organizations/${organizationId}`;
  return (
    <OrganizationProvider value={organization.data}>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
            <div>
              <Link href="/organizations" className="text-xs text-zinc-500 hover:underline">
                All organizations
              </Link>
              <p className="text-lg font-semibold">{organization.data.name}</p>
            </div>
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">
              {humanize(organization.data.role)}
            </span>
          </div>
          <nav className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 whitespace-nowrap">
            {SECTIONS.filter(
              (section) =>
                !section.permission || hasPermission(organization.data.role, section.permission),
            ).map((section) => {
              const href = `${base}/${section.href}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={section.href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`border-b-2 px-3 py-2 text-sm ${
                    active
                      ? 'border-zinc-900 font-medium dark:border-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8">
          {children}
        </main>
      </div>
    </OrganizationProvider>
  );
}
