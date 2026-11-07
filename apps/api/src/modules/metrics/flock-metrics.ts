import type { FlockPurpose } from '@farmos/shared-types';

/**
 * Daily flock metrics, implemented exactly as defined in
 * docs/architecture/metrics.md. Pure functions: callers load the inputs, so
 * the formulas can be tested against hand-calculated fixtures.
 */

const DAY_MS = 86_400_000;

export interface BatchFacts {
  placementDate: Date;
  endDate: Date | null;
  initialBirds: number;
  purpose: FlockPurpose;
}

/** Per-day totals keyed by calendar date (YYYY-MM-DD). Absent key = nothing recorded. */
export interface DailyInputs {
  deaths: ReadonlyMap<string, number>;
  eggs: ReadonlyMap<string, number>;
  feedKg: ReadonlyMap<string, number>;
  waterLitres: ReadonlyMap<string, number>;
  averageWeightGrams: ReadonlyMap<string, number>;
}

export interface DailyMetrics {
  date: string;
  ageDays: number;
  openingBirds: number;
  deaths: number;
  closingBirds: number;
  /** deaths / opening birds × 100; null when no birds opened the day */
  mortalityRatePct: number | null;
  /** deaths to date / initial birds × 100 */
  cumulativeMortalityPct: number;
  eggs: number | null;
  /** eggs / opening birds × 100; laying flocks only, null without a log */
  henDayPct: number | null;
  feedKg: number | null;
  /** feed / average of opening and closing birds; null without feed records */
  feedPerBirdKg: number | null;
  waterLitres: number | null;
  averageWeightGrams: number | null;
}

export const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export function laysEggs(purpose: FlockPurpose): boolean {
  return purpose === 'LAYER' || purpose === 'BREEDER';
}

/** Live birds at the start of a day: initial placement minus all earlier deaths. */
export function openingBirds(
  batch: Pick<BatchFacts, 'initialBirds'>,
  deaths: ReadonlyMap<string, number>,
  day: Date,
): number {
  const key = dateKey(day);
  let dead = 0;
  for (const [date, count] of deaths) if (date < key) dead += count;
  return batch.initialBirds - dead;
}

const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : null;

/**
 * One row per calendar day in [from, to], clipped to the batch's life. Deaths
 * before `from` still count towards the opening population.
 */
export function dailyMetrics(
  batch: BatchFacts,
  inputs: DailyInputs,
  from: Date,
  to: Date,
): DailyMetrics[] {
  const last = batch.endDate && batch.endDate < to ? batch.endDate : to;
  const first = from < batch.placementDate ? batch.placementDate : from;
  const rows: DailyMetrics[] = [];
  let dead = 0;

  for (let t = batch.placementDate.getTime(); t <= last.getTime(); t += DAY_MS) {
    const date = dateKey(new Date(t));
    const opening = batch.initialBirds - dead;
    const deaths = inputs.deaths.get(date) ?? 0;
    dead += deaths;
    if (t < first.getTime()) continue;

    const closing = opening - deaths;
    const eggs = inputs.eggs.get(date) ?? null;
    const feedKg = inputs.feedKg.get(date) ?? null;
    rows.push({
      date,
      ageDays: Math.round((t - batch.placementDate.getTime()) / DAY_MS),
      openingBirds: opening,
      deaths,
      closingBirds: closing,
      mortalityRatePct: percent(deaths, opening),
      cumulativeMortalityPct: (dead / batch.initialBirds) * 100,
      eggs,
      henDayPct: laysEggs(batch.purpose) && eggs !== null ? percent(eggs, opening) : null,
      feedKg,
      feedPerBirdKg: feedKg === null ? null : ratio(feedKg, (opening + closing) / 2),
      waterLitres: inputs.waterLitres.get(date) ?? null,
      averageWeightGrams: inputs.averageWeightGrams.get(date) ?? null,
    });
  }
  return rows;
}

function percent(numerator: number, denominator: number): number | null {
  const value = ratio(numerator, denominator);
  return value === null ? null : value * 100;
}

/** Headline numbers for a batch, from its total deaths so far. */
export function batchTotals(batch: Pick<BatchFacts, 'initialBirds'>, totalDeaths: number) {
  return {
    liveBirds: batch.initialBirds - totalDeaths,
    cumulativeMortalityPct: (totalDeaths / batch.initialBirds) * 100,
  };
}
