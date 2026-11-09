import type { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../database/prisma.service.js';
import { loadDailyInputs } from '../metrics/daily-inputs.js';
import { dailyMetrics, type DailyMetrics } from '../metrics/flock-metrics.js';
import type { DateRange } from './analytics.schemas.js';

const flockSelect = {
  id: true,
  batchCode: true,
  breed: true,
  purpose: true,
  status: true,
  placementDate: true,
  endDate: true,
  initialBirds: true,
  house: { select: { id: true, name: true, farm: { select: { id: true, name: true } } } },
} as const satisfies Prisma.FlockBatchSelect;

export type WindowFlock = Prisma.FlockBatchGetPayload<{ select: typeof flockSelect }>;

export interface FlockWindow {
  flock: WindowFlock;
  /** One row per day of the flock's life inside the range, oldest first. */
  rows: DailyMetrics[];
}

/**
 * Every flock that had birds at some point in the range, with its daily
 * metrics for the overlap. The basis of every dashboard figure.
 */
export async function loadFlockWindows(
  tx: Tx,
  organizationId: string,
  range: DateRange,
  filter: { farmId?: string; batchId?: string; activeOnly?: boolean } = {},
): Promise<FlockWindow[]> {
  const flocks = await tx.flockBatch.findMany({
    where: {
      organizationId,
      status: filter.activeOnly ? 'ACTIVE' : { not: 'PLANNED' },
      placementDate: { lte: range.to },
      OR: [{ endDate: null }, { endDate: { gte: range.from } }],
      ...(filter.farmId && { house: { farmId: filter.farmId } }),
      ...(filter.batchId && { id: filter.batchId }),
    },
    select: flockSelect,
    orderBy: [{ placementDate: 'asc' }, { batchCode: 'asc' }],
  });
  if (flocks.length === 0) return [];

  const inputs = await loadDailyInputs(tx, organizationId, flocks, range.from, range.to);
  return flocks.map((flock) => ({
    flock,
    rows: dailyMetrics(flock, inputs.get(flock.id)!, range.from, range.to),
  }));
}
