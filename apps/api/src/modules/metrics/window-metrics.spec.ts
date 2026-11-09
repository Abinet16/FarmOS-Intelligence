import { readFileSync } from 'node:fs';
import {
  addTotals,
  combineDays,
  dailyMetrics,
  feedConversionRatio,
  windowKpis,
  windowTotals,
  type BatchFacts,
  type DailyInputs,
} from './flock-metrics.js';

const d = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * A known dataset: 2,000 broilers over their first 15 days (deaths, feed and
 * three weigh days). The expected values were computed independently in a
 * spreadsheet-style script from docs/architecture/metrics.md, not by running
 * this code. If a formula changes, these numbers say whether it still agrees.
 */
function loadKnownBroilerFlock(): { batch: BatchFacts; inputs: DailyInputs } {
  const csv = readFileSync(new URL('./__fixtures__/broiler-15-days.csv', import.meta.url), 'utf8');
  const [, ...lines] = csv.trim().split('\n');
  const deaths = new Map<string, number>();
  const feedKg = new Map<string, number>();
  const averageWeightGrams = new Map<string, number>();
  for (const line of lines) {
    const [date, dead, feed, weight] = line.split(',');
    deaths.set(date!, Number(dead));
    feedKg.set(date!, Number(feed));
    if (weight) averageWeightGrams.set(date!, Number(weight));
  }
  return {
    batch: {
      placementDate: d('2026-09-01'),
      endDate: null,
      initialBirds: 2000,
      purpose: 'BROILER',
    },
    inputs: { deaths, eggs: new Map(), feedKg, waterLitres: new Map(), averageWeightGrams },
  };
}

describe('window metrics against a known broiler dataset', () => {
  const { batch, inputs } = loadKnownBroilerFlock();
  const all = dailyMetrics(batch, inputs, d('2026-09-01'), d('2026-09-15'));

  it('reproduces the population', () => {
    expect(all).toHaveLength(15);
    expect(all.at(-1)).toMatchObject({ closingBirds: 1933, cumulativeMortalityPct: 3.35 });
    expect(all[7]).toMatchObject({ openingBirds: 1953 });
    expect(all[7]!.mortalityRatePct).toBeCloseTo(0.15361, 5);
  });

  it('computes window KPIs from summed parts', () => {
    const kpis = windowKpis(windowTotals(all, batch.purpose));
    expect(kpis.mortalityPct).toBeCloseTo(3.35, 10);
    expect(kpis.feedPerBirdKg).toBeCloseTo(0.0451625, 6);
    expect(kpis.henDayPct).toBeNull(); // broilers
  });

  it('measures window mortality against the birds alive when the window opens', () => {
    const lateWindow = all.filter((row) => row.date >= '2026-09-08');
    expect(windowKpis(windowTotals(lateWindow, batch.purpose)).mortalityPct).toBeCloseTo(
      1.02407,
      5,
    );
  });

  it('computes FCR between the first and last weigh days', () => {
    // 1,295 kg eaten on days 1–14; biomass 84.0 kg → 874.62 kg.
    expect(feedConversionRatio(all)).toBeCloseTo(1.63796, 5);
    // Within days 7–14 the bracketing weigh days are 7 and 14.
    const lateWindow = all.filter((row) => row.date >= '2026-09-08');
    expect(feedConversionRatio(lateWindow)).toBeCloseTo(1.72604, 5);
  });

  it('refuses FCR without two weigh days or with a feed gap', () => {
    expect(feedConversionRatio(all.slice(1, 7))).toBeNull();
    const gap = all.map((row) => (row.date === '2026-09-05' ? { ...row, feedKg: null } : row));
    expect(feedConversionRatio(gap)).toBeNull();
  });
});

describe('combining flocks', () => {
  const day = (date: string, opening: number, deaths: number, eggs: number | null) => ({
    date,
    ageDays: 0,
    openingBirds: opening,
    deaths,
    closingBirds: opening - deaths,
    mortalityRatePct: null,
    cumulativeMortalityPct: 0,
    eggs,
    henDayPct: null,
    feedKg: 100,
    feedPerBirdKg: null,
    waterLitres: null,
    averageWeightGrams: null,
  });

  // Two layer flocks of very different sizes on the same day.
  const big = { purpose: 'LAYER' as const, rows: [day('2026-10-01', 9000, 9, 8100)] };
  const small = { purpose: 'LAYER' as const, rows: [day('2026-10-01', 1000, 10, 500)] };

  it('weights rates by birds instead of averaging percentages', () => {
    // Averaging 90% and 50% would give 70%; the flock-weighted rate is 86%.
    const [combined] = combineDays([big, small]);
    expect(combined!.henDayPct).toBeCloseTo(86, 10); // 8,600 / 10,000
    expect(combined!.mortalityRatePct).toBeCloseTo(0.19, 10); // 19 / 10,000
    expect(combined!.feedKg).toBe(200);

    const totals = addTotals(windowTotals(big.rows, 'LAYER'), windowTotals(small.rows, 'LAYER'));
    expect(windowKpis(totals).henDayPct).toBeCloseTo(86, 10);
  });

  it('leaves broilers out of egg production', () => {
    const broilers = { purpose: 'BROILER' as const, rows: [day('2026-10-01', 5000, 0, null)] };
    const [combined] = combineDays([small, broilers]);
    expect(combined!.henDayPct).toBeCloseTo(50, 10);
    expect(combined!.openingBirds).toBe(6000);
  });

  it('reports a day without any egg counts as null', () => {
    const [combined] = combineDays([{ purpose: 'LAYER', rows: [day('2026-10-01', 10, 0, null)] }]);
    expect(combined!.eggs).toBeNull();
    expect(combined!.henDayPct).toBeNull();
  });
});
