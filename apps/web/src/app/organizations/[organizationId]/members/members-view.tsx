'use client';

import { ROLES, type Role } from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, type Member } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { formatDate, humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

/**
 * Everyone can see who belongs to the organization; owners add people, change
 * roles and remove them. The API keeps at least one owner and answers 409 if
 * a change would remove the last one.
 */
export function MembersView() {
  const organization = useOrganization();
  const canManage = useCan('access:manage');
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const base = `/organizations/${organization.id}/members`;
  const key = ['members', organization.id];

  const members = useQuery({ queryKey: key, queryFn: () => api<Member[]>(base) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (input: { email: string; role: Role }) =>
      api<Member>(base, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api<Member>(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`${base}/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    add.mutate(
      { email: String(data.get('email')), role: data.get('role') as Role },
      { onSuccess: () => form.reset() },
    );
  }

  function onRemove(member: Member) {
    if (window.confirm(`Remove ${member.user.name} from ${organization.name}?`)) {
      remove.mutate(member.id);
    }
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-zinc-500">
          Roles decide what each person can do in this organization.
        </p>
      </div>

      <ErrorMessage error={members.error ?? changeRole.error ?? remove.error} />
      {members.data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                {canManage && (
                  <th className="px-4 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {members.data.map((member) => {
                const isMe = member.user.id === session?.user.id;
                return (
                  <tr key={member.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium">
                        {member.user.name}
                        {isMe && <span className="ml-2 text-xs text-zinc-500">(you)</span>}
                      </p>
                      <p className="text-zinc-500">{member.user.email}</p>
                    </td>
                    <td className="px-4 py-2">
                      {canManage ? (
                        <select
                          aria-label={`Role of ${member.user.name}`}
                          className="input py-1"
                          value={member.role}
                          disabled={changeRole.isPending}
                          onChange={(event) =>
                            changeRole.mutate({ id: member.id, role: event.target.value as Role })
                          }
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {humanize(role)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        humanize(member.role)
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{formatDate(member.createdAt)}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={remove.isPending}
                          onClick={() => onRemove(member)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <section aria-labelledby="add-member" className="flex flex-col gap-3">
          <div>
            <h2 id="add-member" className="text-lg font-medium">
              Add a member
            </h2>
            <p className="text-sm text-zinc-500">They need a FarmOS account first.</p>
          </div>
          <form onSubmit={onAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Email
              <input name="email" type="email" required className="input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Role
              <select name="role" defaultValue="FIELD_WORKER" className="input">
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {humanize(role)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={add.isPending} className="btn-primary">
              {add.isPending ? 'Adding…' : 'Add'}
            </button>
          </form>
          <ErrorMessage error={add.error} />
        </section>
      )}
    </>
  );
}
