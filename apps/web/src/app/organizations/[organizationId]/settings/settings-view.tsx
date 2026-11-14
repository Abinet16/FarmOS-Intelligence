'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, type Organization } from '@/lib/api';
import { useCan, useOrganization } from '@/lib/organization-context';

/**
 * The organization's name and time zone. The time zone decides which calendar
 * day a record falls on, so changing it moves "today" for everyone.
 */
export function SettingsView() {
  const organization = useOrganization();
  const canManage = useCan('organization:manage');
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const update = useMutation({
    mutationFn: (input: { name: string; timezone: string }) =>
      api<Organization>(`/organizations/${organization.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setSaved(true);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaved(false);
    update.mutate({ name: String(data.get('name')), timezone: String(data.get('timezone')) });
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500">
          {canManage ? 'Changes apply to every member.' : 'Only owners can change these settings.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={organization.name}
            disabled={!canManage}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Time zone
          <input
            name="timezone"
            required
            defaultValue={organization.timezone}
            disabled={!canManage}
            className="input"
          />
          <span className="text-zinc-500">
            An IANA name such as Africa/Addis_Ababa. It decides which day a record belongs to.
          </span>
        </label>
        <p className="text-sm text-zinc-500">
          Address: <code>{organization.slug}</code>
        </p>
        {canManage && (
          <button type="submit" disabled={update.isPending} className="btn-primary self-start">
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        )}
        <ErrorMessage error={update.error} />
        {saved && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            Saved.
          </p>
        )}
      </form>
    </>
  );
}
