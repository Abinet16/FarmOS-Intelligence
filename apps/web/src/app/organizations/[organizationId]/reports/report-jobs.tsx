'use client';

import { REPORT_TYPES } from '@farmos/shared-types';
import { useState } from 'react';
import type { ReportJob } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatCount, formatDate, formatDateTime } from '@/lib/format';
import { describeParameters, JOB_STATUS_LABELS, JOB_STATUS_STYLES } from './report-format';

function DownloadButton({ organizationId, job }: { organizationId: string; job: ReportJob }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary px-3 py-1 text-xs"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await downloadFile(
              `/organizations/${organizationId}/reports/${job.id}/download`,
              `${job.reportType}.csv`,
            );
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'The download failed');
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Downloading…' : 'Download CSV'}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}

/** The member's own report jobs, newest first. */
export function ReportJobs({
  organizationId,
  jobs,
  names,
  highlight,
}: {
  organizationId: string;
  jobs: ReportJob[];
  names: { farms: Map<string, string>; flocks: Map<string, string> };
  highlight: string | null;
}) {
  if (jobs.length === 0) {
    return <p className="text-sm text-zinc-500">You haven’t generated any reports yet.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {jobs.map((job) => (
        <li
          key={job.id}
          className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
            job.id === highlight ? 'bg-amber-50 dark:bg-amber-950/30' : ''
          }`}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {REPORT_TYPES[job.reportType]?.label ?? job.reportType}
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${JOB_STATUS_STYLES[job.status]}`}
              >
                {JOB_STATUS_LABELS[job.status]}
              </span>
            </p>
            <p className="text-xs text-zinc-500">
              {describeParameters(job.parameters, names)} · requested{' '}
              {formatDateTime(job.createdAt)}
            </p>
            {job.status === 'SUCCEEDED' && job.rowCount !== null && (
              <p className="text-xs text-zinc-500">
                {formatCount(job.rowCount)} rows · available until {formatDate(job.expiresAt)}
              </p>
            )}
            {job.error && <p className="text-xs text-red-600">{job.error}</p>}
          </div>
          {job.downloadable && <DownloadButton organizationId={organizationId} job={job} />}
        </li>
      ))}
    </ul>
  );
}
