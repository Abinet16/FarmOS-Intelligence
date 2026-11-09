import type { FlockPurpose } from '@farmos/shared-types';
import type { Tx } from '../../database/prisma.service.js';
import { dateKey, laysEggs, type DailyInputs } from './flock-metrics.js';

interface FlockRef {
  id: string;
  purpose: FlockPurpose;
}

/**
 * Loads the per-day inputs for any number of flocks in four grouped queries,
 * whatever the number of flocks. Voided records are excluded. Deaths are
 * loaded from placement, because earlier deaths set the opening population.
 */
export async function loadDailyInputs(
  tx: Tx,
  organizationId: string,
  flocks: readonly FlockRef[],
  from: Date,
  to: Date,
): Promise<Map<string, DailyInputs>> {
  const batchId = { in: flocks.map((flock) => flock.id) };
  const live = { organizationId, batchId, voidedAt: null };
  const window = { gte: from, lte: to };

  const [deaths, logs, feed, weights] = await Promise.all([
    tx.mortalityEvent.groupBy({
      by: ['batchId', 'eventDate'],
      where: { ...live, eventDate: { lte: to } },
      _sum: { quantity: true },
    }),
    tx.productionLog.findMany({
      where: { organizationId, batchId, logDate: window },
      select: { batchId: true, logDate: true, eggsCollected: true, waterConsumption: true },
    }),
    tx.feedUsage.groupBy({
      by: ['batchId', 'usageDate'],
      where: { ...live, usageDate: window },
      _sum: { quantityKg: true },
    }),
    tx.weightSample.findMany({
      where: { ...live, sampleDate: window },
      select: { batchId: true, sampleDate: true, sampleSize: true, averageWeightGrams: true },
    }),
  ]);

  const inputs = new Map<string, Collecting>();
  for (const flock of flocks) {
    inputs.set(flock.id, {
      deaths: new Map(),
      eggs: new Map(),
      feedKg: new Map(),
      waterLitres: new Map(),
      weighed: new Map(),
    });
  }
  const layers = new Set(flocks.filter((f) => laysEggs(f.purpose)).map((f) => f.id));

  for (const row of deaths) {
    inputs.get(row.batchId)!.deaths.set(dateKey(row.eventDate), row._sum.quantity ?? 0);
  }
  for (const log of logs) {
    const target = inputs.get(log.batchId)!;
    if (layers.has(log.batchId)) {
      target.eggs.set(dateKey(log.logDate), log.eggsCollected);
    }
    if (log.waterConsumption !== null) {
      target.waterLitres.set(dateKey(log.logDate), Number(log.waterConsumption));
    }
  }
  for (const row of feed) {
    inputs.get(row.batchId)!.feedKg.set(dateKey(row.usageDate), Number(row._sum.quantityKg ?? 0));
  }
  // Several samples on one day combine weighted by sample size.
  for (const sample of weights) {
    const target = inputs.get(sample.batchId)!;
    const key = dateKey(sample.sampleDate);
    const total = target.weighed.get(key) ?? { grams: 0, birds: 0 };
    total.grams += Number(sample.averageWeightGrams) * sample.sampleSize;
    total.birds += sample.sampleSize;
    target.weighed.set(key, total);
  }

  const result = new Map<string, DailyInputs>();
  for (const [id, { weighed, ...rest }] of inputs) {
    result.set(id, {
      ...rest,
      averageWeightGrams: new Map(
        [...weighed].map(([key, { grams, birds }]) => [key, grams / birds]),
      ),
    });
  }
  return result;
}

/** Mutable maps while loading; weights accumulate before averaging. */
interface Collecting {
  deaths: Map<string, number>;
  eggs: Map<string, number>;
  feedKg: Map<string, number>;
  waterLitres: Map<string, number>;
  weighed: Map<string, { grams: number; birds: number }>;
}
