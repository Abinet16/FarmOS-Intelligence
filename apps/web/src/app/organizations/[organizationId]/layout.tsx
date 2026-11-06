import { Suspense } from 'react';
import { OrganizationShell } from './organization-shell';

/**
 * Everything under an organization depends on the URL and the session, so it
 * renders on the client inside a Suspense boundary.
 */
export default function OrganizationLayout({
  children,
}: LayoutProps<'/organizations/[organizationId]'>) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-zinc-500">Loading…</p>}>
      <OrganizationShell>{children}</OrganizationShell>
    </Suspense>
  );
}
