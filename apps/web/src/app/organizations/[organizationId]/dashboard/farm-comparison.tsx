import type { FarmComparison } from '@/lib/api';
import { formatCount, formatNumber, formatPercent } from '@/lib/format';

/**
 * Farms side by side. A table, not a chart: a handful of farms and several
 * measures read best as rows. Rates are weighted by birds, so farms of
 * different sizes compare fairly.
 */
export function FarmComparisonTable({ data }: { data: FarmComparison }) {
  if (data.farms.length === 0) return null;
  return (
    <section aria-labelledby="farm-comparison" className="flex flex-col gap-3">
      <h2 id="farm-comparison" className="text-lg font-medium">
        Farms compared
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-right text-sm tabular-nums">
          <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Farm</th>
              <th className="px-3 py-2 font-medium">Flocks</th>
              <th className="px-3 py-2 font-medium">Birds now</th>
              <th className="px-3 py-2 font-medium">Eggs</th>
              <th className="px-3 py-2 font-medium">Hen-day</th>
              <th className="px-3 py-2 font-medium">Mortality</th>
              <th className="px-3 py-2 font-medium">Feed kg/bird/day</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data.farms.map((row) => (
              <tr key={row.farm.id}>
                <td className="px-3 py-1.5 text-left font-medium">{row.farm.name}</td>
                <td className="px-3 py-1.5">{row.flocks}</td>
                <td className="px-3 py-1.5">{formatCount(row.birdsAtEnd)}</td>
                <td className="px-3 py-1.5">{formatCount(row.totals.eggs)}</td>
                <td className="px-3 py-1.5">{formatPercent(row.kpis.henDayPct)}</td>
                <td className="px-3 py-1.5">{formatPercent(row.kpis.mortalityPct)}</td>
                <td className="px-3 py-1.5">{formatNumber(row.kpis.feedPerBirdKg, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
