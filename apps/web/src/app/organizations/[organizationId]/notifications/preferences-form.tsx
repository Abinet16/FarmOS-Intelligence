'use client';

import { SEVERITIES, type NotificationPreferences, type Severity } from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api } from '@/lib/api';
import { humanize } from '@/lib/format';

/** Which notifications are also emailed. In-app notifications are always on. */
export function PreferencesForm({ organizationId }: { organizationId: string }) {
  const path = `/organizations/${organizationId}/notification-preferences`;
  const saved = useQuery({
    queryKey: ['notification-preferences', organizationId],
    queryFn: () => api<NotificationPreferences>(path),
  });
  if (!saved.data) return <ErrorMessage error={saved.error} />;
  return <PreferencesFields path={path} organizationId={organizationId} initial={saved.data} />;
}

function PreferencesFields({
  path,
  organizationId,
  initial,
}: {
  path: string;
  organizationId: string;
  initial: NotificationPreferences;
}) {
  const queryClient = useQueryClient();
  const [alerts, setAlerts] = useState<Severity | ''>(initial.emailAlertsMinSeverity ?? '');
  const [reports, setReports] = useState(initial.emailReports);

  const save = useMutation({
    mutationFn: (preferences: NotificationPreferences) =>
      api<NotificationPreferences>(path, { method: 'PUT', body: JSON.stringify(preferences) }),
    onSuccess: (data) =>
      queryClient.setQueryData(['notification-preferences', organizationId], data),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ emailAlertsMinSeverity: alerts || null, emailReports: reports });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email me about new alerts</span>
        <select
          className="input max-w-xs"
          value={alerts}
          onChange={(event) => setAlerts(event.target.value as Severity | '')}
        >
          <option value="">Never</option>
          {[...SEVERITIES].reverse().map((severity) => (
            <option key={severity} value={severity}>
              {severity === 'LOW' ? 'Any severity' : `${humanize(severity)} and above`}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">
          You’re notified in the app about alerts your role acts on, whatever you choose here.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={reports}
          onChange={(event) => setReports(event.target.checked)}
        />
        Email me when a report I requested is ready or fails
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save preferences'}
        </button>
        {save.isSuccess && <span className="text-sm text-emerald-700">Saved</span>}
      </div>
      <ErrorMessage error={save.error} />
    </form>
  );
}
