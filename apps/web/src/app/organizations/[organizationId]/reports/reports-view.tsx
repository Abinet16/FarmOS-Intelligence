'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Pagination } from '@/components/pagination';
import {
  api,
  queryString,
  type Farm,
  type FlockBatch,
  type Page,
  type ReportJob,
  type ReportTypeOption,
} from '@/lib/api';
import { useOrganization } from '@/lib/organization-context';
import { ReportForm } from './report-form';
import { inProgress } from './report-format';
import { ReportJobs } from './report-jobs';

/**
 * Generate reports in the background and download them when ready. Each
 * member sees only the reports they requested.
 */
export function ReportsView() {
  const organization = useOrganization();
  const base = `/organizations/${organization.id}`;
  const queryClient = useQueryClient();
  const highlight = useSearchParams().get('job');
  const [page, setPage] = useState(1);

  const types = useQuery({
    queryKey: ['report-types', organization.id],
    queryFn: () => api<ReportTypeOption[]>(`${base}/reports/types`),
  });
  const jobs = useQuery({
    queryKey: ['reports', organization.id, page],
    queryFn: () => api<Page<ReportJob>>(`${base}/reports${queryString({ page, pageSize: 10 })}`),
    // Poll while the worker is still on something.
    refetchInterval: (query) =>
      query.state.data?.items.some((job) => inProgress(job.status)) ? 3_000 : false,
  });
  const needsFarms = types.data?.some((type) => type.filters.length > 0) ?? false;
  const farms = useQuery({
    queryKey: ['farms', organization.id, { pageSize: 100 }],
    queryFn: () => api<Page<Farm>>(`${base}/farms${queryString({ pageSize: 100 })}`),
    enabled: needsFarms,
  });
  const flocks = useQuery({
    queryKey: ['flock-batches', organization.id, { pageSize: 100 }],
    queryFn: () => api<Page<FlockBatch>>(`${base}/flock-batches${queryString({ pageSize: 100 })}`),
    enabled: needsFarms,
  });

  const names = useMemo(
    () => ({
      farms: new Map((farms.data?.items ?? []).map((farm) => [farm.id, farm.name])),
      flocks: new Map((flocks.data?.items ?? []).map((flock) => [flock.id, flock.batchCode])),
    }),
    [farms.data, flocks.data],
  );

  const request = useMutation({
    mutationFn: (body: object) =>
      api<ReportJob>(`${base}/reports`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setPage(1);
      return queryClient.invalidateQueries({ queryKey: ['reports', organization.id] });
    },
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <section aria-labelledby="new-report" className="flex flex-col gap-3">
        <h2 id="new-report" className="text-lg font-medium">
          New report
        </h2>
        <ErrorMessage error={types.error} />
        {types.data && (
          <ReportForm
            types={types.data}
            farms={farms.data?.items ?? []}
            flocks={flocks.data?.items ?? []}
            pending={request.isPending}
            onRequest={request.mutateAsync}
          />
        )}
        <ErrorMessage error={request.error} />
      </section>

      <section aria-labelledby="your-reports" className="flex flex-col gap-3">
        <h2 id="your-reports" className="text-lg font-medium">
          Your reports
        </h2>
        <ErrorMessage error={jobs.error} />
        {jobs.data && (
          <>
            <ReportJobs
              organizationId={organization.id}
              jobs={jobs.data.items}
              names={names}
              highlight={highlight}
            />
            <Pagination page={jobs.data} onChange={setPage} />
          </>
        )}
      </section>
    </>
  );
}
