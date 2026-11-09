import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import type { FlockSummary } from '@/lib/api';
import { formatCount, formatNumber, formatPercent } from '@/lib/format';

/** Every flock with birds in the range, with FCR where weigh days allow it. */
export function FlockComparisonTable({ base, flocks }: { base: string; flocks: FlockSummary[] }) {
  if (flocks.length === 0) return null;
  return (
    <section aria-labelledby="flock-comparison" className="flex flex-col gap-3">
      <h2 id="flock-comparison" className="text-lg font-medium">
        Flocks in this period
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-right text-sm tabular-nums">
          <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Flock</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Birds</th>
              <th className="px-3 py-2 font-medium">Hen-day</th>
              <th className="px-3 py-2 font-medium">Mortality</th>
              <th className="px-3 py-2 font-medium">kg/bird/day</th>
              <th
                className="px-3 py-2 font-medium"
                title="Feed conversion ratio between weigh days"
              >
                FCR
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {flocks.map((row) => (
              <tr key={row.flock.id}>
                <td className="px-3 py-1.5 text-left">
                  <Link
                    href={`${base}/flocks/${row.flock.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.flock.batchCode}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    {row.flock.house.farm.name} / {row.flock.house.name}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-left">
                  <StatusBadge status={row.flock.status} />
                </td>
                <td className="px-3 py-1.5">
                  {row.birdsAtEnd === null ? '—' : formatCount(row.birdsAtEnd)}
                </td>
                <td className="px-3 py-1.5">{formatPercent(row.kpis.henDayPct)}</td>
                <td className="px-3 py-1.5">{formatPercent(row.kpis.mortalityPct)}</td>
                <td className="px-3 py-1.5">{formatNumber(row.kpis.feedPerBirdKg, 3)}</td>
                <td className="px-3 py-1.5">{formatNumber(row.fcr, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
