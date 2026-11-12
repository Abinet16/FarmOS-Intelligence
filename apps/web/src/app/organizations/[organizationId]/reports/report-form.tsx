'use client';

import type { ReportParameters, ReportType } from '@farmos/shared-types';
import { useState, type FormEvent } from 'react';
import type { ReportTypeOption } from '@/lib/api';
import { todayIn } from '@/lib/format';
import { useOrganization } from '@/lib/organization-context';
import { rangeDays } from './report-format';

const DAY_MS = 86_400_000;

function daysBefore(date: string, days: number) {
  return new Date(Date.parse(date) - days * DAY_MS).toISOString().slice(0, 10);
}

/** A new key per form submission, so a retried request can't create a second job. */
const newKey = () => crypto.randomUUID();

export function ReportForm({
  types,
  farms,
  flocks,
  pending,
  onRequest,
}: {
  types: ReportTypeOption[];
  farms: { id: string; name: string }[];
  flocks: { id: string; batchCode: string }[];
  pending: boolean;
  onRequest: (request: {
    type: ReportType;
    parameters: ReportParameters;
    idempotencyKey: string;
  }) => Promise<unknown>;
}) {
  const organization = useOrganization();
  const today = todayIn(organization.timezone);
  const [type, setType] = useState<ReportType | ''>(types[0]?.type ?? '');
  const [from, setFrom] = useState(daysBefore(today, 29));
  const [to, setTo] = useState(today);
  const [farmId, setFarmId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [key, setKey] = useState(newKey);

  const selected = types.find((option) => option.type === type);
  const days = rangeDays(from, to);
  const tooLong = Boolean(selected?.dated && days !== null && days > selected.maxRangeDays);
  const reversed = Boolean(selected?.dated && days !== null && days < 1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || pending || tooLong || reversed) return;
    const parameters: ReportParameters = {
      ...(selected.dated && { from, to }),
      ...(farmId && selected.filters.includes('farmId') && { farmId }),
      ...(batchId && selected.filters.includes('batchId') && { batchId }),
    };
    try {
      await onRequest({ type: selected.type, parameters, idempotencyKey: key });
      setKey(newKey());
    } catch {
      // Shown by the caller. The key is kept, so trying again can't duplicate the job.
    }
  }

  if (types.length === 0) {
    return <p className="text-sm text-zinc-500">Your role has no reports to run.</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Report</span>
        <select
          className="input"
          value={type}
          onChange={(event) => setType(event.target.value as ReportType)}
        >
          {types.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label}
            </option>
          ))}
        </select>
        {selected && <span className="text-xs text-zinc-500">{selected.description}</span>}
      </label>

      {selected?.dated && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">From</span>
            <input
              type="date"
              className="input"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">To</span>
            <input
              type="date"
              className="input"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              required
            />
          </label>
        </>
      )}

      {selected?.filters.includes('farmId') && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Farm</span>
          <select className="input" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            <option value="">All farms</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected?.filters.includes('batchId') && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Flock</span>
          <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All flocks</option>
            {flocks.map((flock) => (
              <option key={flock.id} value={flock.id}>
                {flock.batchCode}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        <p className={`text-xs ${tooLong || reversed ? 'text-red-600' : 'text-zinc-500'}`}>
          {reversed
            ? 'The start date must be on or before the end date.'
            : tooLong
              ? `This report can cover at most ${selected?.maxRangeDays} days.`
              : 'Reports are generated in the background. You’ll get a notification when it’s ready.'}
        </p>
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || !selected || tooLong || reversed}
        >
          {pending ? 'Requesting…' : 'Generate report'}
        </button>
      </div>
    </form>
  );
}
