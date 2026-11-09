'use client';

import { ALERT_RULES, type AlertRule, type AlertSettings } from '@farmos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useCan, useOrganization } from '@/lib/organization-context';

/** Thresholds for the alert rules; managers and owners only. */
export function AlertSettingsForm() {
  const organization = useOrganization();
  const canConfigure = useCan('farm:configure');
  const queryClient = useQueryClient();
  const url = `/organizations/${organization.id}/alert-settings`;

  const settings = useQuery({
    queryKey: ['alert-settings', organization.id],
    queryFn: () => api<AlertSettings>(url),
    enabled: canConfigure,
  });
  const save = useMutation({
    mutationFn: (body: AlertSettings) =>
      api<AlertSettings>(url, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (data) => queryClient.setQueryData(['alert-settings', organization.id], data),
  });

  if (!canConfigure || !settings.data) return null;
  const current = settings.data;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    save.mutate({
      dailyMortalityPct: Number(data.get('dailyMortalityPct')),
      henDayDropPoints: Number(data.get('henDayDropPoints')),
      feedDropPct: Number(data.get('feedDropPct')),
      disabledRules: (Object.keys(ALERT_RULES) as AlertRule[]).filter((rule) => !data.get(rule)),
    });
  }

  return (
    <details className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-medium">Alert thresholds</summary>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Daily mortality (%)
            <input
              name="dailyMortalityPct"
              type="number"
              step="0.01"
              min={0.01}
              max={100}
              required
              defaultValue={current.dailyMortalityPct}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Hen-day drop (points)
            <input
              name="henDayDropPoints"
              type="number"
              step="0.1"
              min={0.1}
              max={100}
              required
              defaultValue={current.henDayDropPoints}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Feed intake drop (%)
            <input
              name="feedDropPct"
              type="number"
              step="1"
              min={1}
              max={100}
              required
              defaultValue={current.feedDropPct}
              className="input"
            />
          </label>
        </div>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">Rules</legend>
          {(Object.entries(ALERT_RULES) as [AlertRule, string][]).map(([rule, description]) => (
            <label key={rule} className="flex items-start gap-2">
              <input
                type="checkbox"
                name={rule}
                defaultChecked={!current.disabledRules.includes(rule)}
                className="mt-1"
              />
              <span>
                <strong>{humanize(rule)}</strong>
                <span className="block text-zinc-500">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            Save thresholds
          </button>
        </div>
        <ErrorMessage error={save.error} />
        {save.isSuccess && <p className="text-sm text-emerald-700">Saved.</p>}
      </form>
    </details>
  );
}
