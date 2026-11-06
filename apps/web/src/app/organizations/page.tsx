'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type FormEvent } from 'react';
import { api, ApiError, type Organization } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

/**
 * Lists the organizations the signed-in user belongs to. What is shown here is
 * a convenience only: the API decides what the user may actually access.
 */
export default function OrganizationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api<Organization[]>('/organizations'),
    enabled: Boolean(session),
  });

  const create = useMutation({
    mutationFn: (input: { name: string; timezone: string }) =>
      api<Organization>('/organizations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });

  const unauthenticated =
    (!sessionPending && !session) ||
    (organizations.error instanceof ApiError && organizations.error.status === 401);

  useEffect(() => {
    if (unauthenticated) router.replace('/sign-in');
  }, [unauthenticated, router]);

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate(
      { name: String(data.get('name')), timezone: String(data.get('timezone')) },
      { onSuccess: () => form.reset() },
    );
  }

  async function onSignOut() {
    await authClient.signOut();
    queryClient.clear();
    router.replace('/sign-in');
  }

  if (sessionPending || unauthenticated || organizations.isPending) {
    return <p className="p-8 text-sm text-zinc-500">Loading…</p>;
  }

  const error = organizations.error ?? create.error;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your organizations</h1>
          <p className="text-sm text-zinc-500">Signed in as {session?.user.email}</p>
        </div>
        <button type="button" onClick={onSignOut} className="btn-secondary">
          Sign out
        </button>
      </header>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error.message}
        </p>
      )}

      {organizations.data?.length === 0 && (
        <p className="text-zinc-600 dark:text-zinc-400">
          You are not a member of any organization yet. Create one below, or ask an owner to add
          you.
        </p>
      )}

      {organizations.data && organizations.data.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {organizations.data.map((org) => (
            <li key={org.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <Link
                  href={`/organizations/${org.id}/farms`}
                  className="font-medium hover:underline"
                >
                  {org.name}
                </Link>
                <p className="text-sm text-zinc-500">{org.timezone}</p>
              </div>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">
                {org.role.replace('_', ' ').toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="create-org" className="flex flex-col gap-3">
        <h2 id="create-org" className="text-lg font-medium">
          Create an organization
        </h2>
        <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Name
            <input name="name" required minLength={2} maxLength={120} className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Time zone
            <input
              name="timezone"
              required
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              className="input"
            />
          </label>
          <button type="submit" disabled={create.isPending} className="btn-primary">
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      </section>
    </main>
  );
}
