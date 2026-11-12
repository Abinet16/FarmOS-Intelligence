'use client';

import {
  canRunReport,
  REPORT_TYPES,
  type ReportParameters,
  type ReportType,
} from '@farmos/shared-types';
import { useState } from 'react';
import { queryString } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { useOrganization } from '@/lib/organization-context';

/**
 * Downloads a report as CSV straight away, for what's on screen. Hidden from
 * roles that can't run the report; longer ranges are sent to Reports.
 */
export function ExportButton({
  type,
  parameters = {},
  label = 'Export CSV',
}: {
  type: ReportType;
  parameters?: ReportParameters;
  label?: string;
}) {
  const organization = useOrganization();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canRunReport(organization.role, type)) return null;

  async function exportCsv() {
    setPending(true);
    setError(null);
    try {
      await downloadFile(
        `/organizations/${organization.id}/exports/${type}${queryString({ ...parameters })}`,
        `${type}.csv`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The export failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary px-3 py-1 text-xs"
        disabled={pending}
        onClick={exportCsv}
        title={`${REPORT_TYPES[type].label} as CSV`}
      >
        {pending ? 'Exporting…' : label}
      </button>
      {error && (
        <span role="alert" className="max-w-xs text-right text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
