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

/**
 * Additive totals over a window. Rates are always computed from summed
 * numerators and denominators, never by averaging daily rates, so totals for
 * several flocks, a farm or the whole organization combine correctly.
 */
export interface WindowTotals {
  days: number;
  /** Birds alive at the start of the first day in the window. */
  startingBirds: number;
  deaths: number;
  eggs: number;
  /** Σ opening birds over days with an egg count, laying flocks only. */
  layingBirdDays: number;
  daysWithEggs: number;
  feedKg: number;
  /** Σ average birds over days with feed records. */
  feedBirdDays: number;
  daysWithFeed: number;
}

export const EMPTY_TOTALS: WindowTotals = {
  days: 0,
  startingBirds: 0,
  deaths: 0,
  eggs: 0,
  layingBirdDays: 0,
  daysWithEggs: 0,
  feedKg: 0,
  feedBirdDays: 0,
  daysWithFeed: 0,
};

export function windowTotals(rows: readonly DailyMetrics[], purpose: FlockPurpose): WindowTotals {
  const totals = { ...EMPTY_TOTALS, days: rows.length };
  // Rows may arrive newest-first; the starting population is the earliest day's.
  const first = rows.reduce<DailyMetrics | undefined>(
    (earliest, row) => (!earliest || row.date < earliest.date ? row : earliest),
    undefined,
  );
  totals.startingBirds = first?.openingBirds ?? 0;
  for (const row of rows) {
    totals.deaths += row.deaths;
    if (laysEggs(purpose) && row.eggs !== null) {
      totals.eggs += row.eggs;
      totals.layingBirdDays += row.openingBirds;
      totals.daysWithEggs += 1;
    }
    if (row.feedKg !== null) {
      totals.feedKg += row.feedKg;
      totals.feedBirdDays += (row.openingBirds + row.closingBirds) / 2;
      totals.daysWithFeed += 1;
    }
  }
  return totals;
}

export function addTotals(a: WindowTotals, b: WindowTotals): WindowTotals {
  return {
    days: Math.max(a.days, b.days),
    startingBirds: a.startingBirds + b.startingBirds,
    deaths: a.deaths + b.deaths,
    eggs: a.eggs + b.eggs,
    layingBirdDays: a.layingBirdDays + b.layingBirdDays,
    daysWithEggs: a.daysWithEggs + b.daysWithEggs,
    feedKg: a.feedKg + b.feedKg,
    feedBirdDays: a.feedBirdDays + b.feedBirdDays,
    daysWithFeed: a.daysWithFeed + b.daysWithFeed,
  };
}

export interface WindowKpis {
  /** Σ eggs / Σ laying bird-days × 100 */
  henDayPct: number | null;
  /** deaths in the window / birds at its start × 100 */
  mortalityPct: number | null;
  /** Σ feed / Σ average birds on days with feed */
  feedPerBirdKg: number | null;
}

export function windowKpis(totals: WindowTotals): WindowKpis {
  return {
    henDayPct: percent(totals.eggs, totals.layingBirdDays),
    mortalityPct: percent(totals.deaths, totals.startingBirds),
    feedPerBirdKg: ratio(totals.feedKg, totals.feedBirdDays),
  };
}

/** One day summed across flocks, with rates from the summed parts. */
export interface CombinedDay {
  date: string;
  openingBirds: number;
  deaths: number;
  mortalityRatePct: number | null;
  eggs: number | null;
  henDayPct: number | null;
  feedKg: number | null;
  feedPerBirdKg: number | null;
}

export function combineDays(
  flocks: readonly { purpose: FlockPurpose; rows: readonly DailyMetrics[] }[],
): CombinedDay[] {
  const byDate = new Map<string, DailyMetrics[]>();
  const laying = new Map<string, DailyMetrics[]>();
  for (const flock of flocks) {
    for (const row of flock.rows) {
      byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
      if (laysEggs(flock.purpose) && row.eggs !== null) {
        laying.set(row.date, [...(laying.get(row.date) ?? []), row]);
      }
    }
  }
  return [...byDate.keys()].sort().map((date) => {
    const rows = byDate.get(date)!;
    const sum = (pick: (row: DailyMetrics) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);
    const opening = sum((row) => row.openingBirds);
    const deaths = sum((row) => row.deaths);
    const fed = rows.filter((row) => row.feedKg !== null);
    const feedKg = fed.reduce((total, row) => total + row.feedKg!, 0);
    const feedBirds = fed.reduce(
      (total, row) => total + (row.openingBirds + row.closingBirds) / 2,
      0,
    );
    const layingRows = laying.get(date) ?? [];
    const eggs = layingRows.length ? layingRows.reduce((total, row) => total + row.eggs!, 0) : null;
    const layingBirds = layingRows.reduce((total, row) => total + row.openingBirds, 0);
    return {
      date,
      openingBirds: opening,
      deaths,
      mortalityRatePct: percent(deaths, opening),
      eggs,
      henDayPct: eggs === null ? null : percent(eggs, layingBirds),
      feedKg: fed.length ? feedKg : null,
      feedPerBirdKg: fed.length ? ratio(feedKg, feedBirds) : null,
    };
  });
}

/**
 * Feed conversion ratio between the first and last weigh days in the window:
 * feed eaten after the first weighing up to and including the last, divided
 * by the flock's live-weight gain (average weight × birds alive) in kg.
 * Null unless two weigh days bracket the period, feed was recorded on every
 * day in it, and the flock actually gained weight.
 */
export function feedConversionRatio(rows: readonly DailyMetrics[]): number | null {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const weighed = sorted.filter((row) => row.averageWeightGrams !== null);
  if (weighed.length < 2) return null;
  const first = weighed[0]!;
  const last = weighed[weighed.length - 1]!;

  const span = sorted.filter((row) => row.date > first.date && row.date <= last.date);
  if (span.some((row) => row.feedKg === null)) return null;
  const feedKg = span.reduce((sum, row) => sum + row.feedKg!, 0);

  const biomassKg = (row: DailyMetrics) => (row.averageWeightGrams! * row.openingBirds) / 1000;
  const gainKg = biomassKg(last) - biomassKg(first);
  return gainKg > 0 ? feedKg / gainKg : null;
}
