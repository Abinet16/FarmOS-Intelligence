import {
  batchTotals,
  dailyMetrics,
  openingBirds,
  type BatchFacts,
  type DailyInputs,
} from './flock-metrics.js';

const d = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * Fixture: 1,000 layers placed on 1 Oct. Every expected value below was
 * worked out by hand from the definitions in docs/architecture/metrics.md.
 *
 *   date    deaths  eggs  feed kg  opening  closing
 *   Oct 1      10     —     110     1000      990
 *   Oct 2       0   900     112      990      990
 *   Oct 3      40   891      —       990      950
 *   Oct 4       5     —      95      950      945
 */
const batch: BatchFacts = {
  placementDate: d('2026-10-01'),
  endDate: null,
  initialBirds: 1000,
  purpose: 'LAYER',
};
const inputs: DailyInputs = {
  deaths: new Map([
    ['2026-10-01', 10],
    ['2026-10-03', 40],
    ['2026-10-04', 5],
  ]),
  eggs: new Map([
    ['2026-10-02', 900],
    ['2026-10-03', 891],
  ]),
  feedKg: new Map([
    ['2026-10-01', 110],
    ['2026-10-02', 112],
    ['2026-10-04', 95],
  ]),
  waterLitres: new Map([['2026-10-02', 210.5]]),
  averageWeightGrams: new Map([['2026-10-04', 1520]]),
};

describe('flock metrics', () => {
  const rows = dailyMetrics(batch, inputs, d('2026-10-01'), d('2026-10-04'));
  const day = (date: string) => rows.find((row) => row.date === date)!;

  it('tracks the population from opening birds and deaths', () => {
    expect(rows.map((r) => [r.openingBirds, r.deaths, r.closingBirds])).toEqual([
      [1000, 10, 990],
      [990, 0, 990],
      [990, 40, 950],
      [950, 5, 945],
    ]);
    expect(rows.map((r) => r.ageDays)).toEqual([0, 1, 2, 3]);
  });

  it('computes daily and cumulative mortality', () => {
    expect(day('2026-10-01').mortalityRatePct).toBeCloseTo(1.0, 10); // 10 / 1000
    expect(day('2026-10-03').mortalityRatePct).toBeCloseTo(4.0404, 4); // 40 / 990
    expect(day('2026-10-04').cumulativeMortalityPct).toBeCloseTo(5.5, 10); // 55 / 1000
  });

  it('computes hen-day production against opening birds', () => {
    expect(day('2026-10-02').henDayPct).toBeCloseTo(90.9091, 4); // 900 / 990
    expect(day('2026-10-03').henDayPct).toBeCloseTo(90.0, 10); // 891 / 990
  });

  it('reports missing data as null, never zero', () => {
    expect(day('2026-10-01').eggs).toBeNull();
    expect(day('2026-10-01').henDayPct).toBeNull();
    expect(day('2026-10-03').feedKg).toBeNull();
    expect(day('2026-10-03').feedPerBirdKg).toBeNull();
    expect(day('2026-10-01').waterLitres).toBeNull();
  });

  it('computes feed per bird against the average population', () => {
    expect(day('2026-10-01').feedPerBirdKg).toBeCloseTo(110 / 995, 10); // (1000 + 990) / 2
    expect(day('2026-10-04').feedPerBirdKg).toBeCloseTo(95 / 947.5, 10); // (950 + 945) / 2
  });

  it('counts deaths before the window towards the opening population', () => {
    const [first] = dailyMetrics(batch, inputs, d('2026-10-04'), d('2026-10-04'));
    expect(first).toMatchObject({ openingBirds: 950, closingBirds: 945 });
    expect(openingBirds(batch, inputs.deaths, d('2026-10-04'))).toBe(950);
  });

  it('clips the window to the batch’s life', () => {
    const ended = { ...batch, endDate: d('2026-10-02') };
    const clipped = dailyMetrics(ended, inputs, d('2026-09-25'), d('2026-10-30'));
    expect(clipped.map((r) => r.date)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('does not report hen-day production for broilers', () => {
    const broilers = dailyMetrics(
      { ...batch, purpose: 'BROILER' },
      inputs,
      d('2026-10-02'),
      d('2026-10-02'),
    );
    expect(broilers[0]!.henDayPct).toBeNull();
  });

  it('returns null rates once no birds remain', () => {
    const wipedOut = { ...inputs, deaths: new Map([['2026-10-01', 1000]]) };
    const [, empty] = dailyMetrics(batch, wipedOut, d('2026-10-01'), d('2026-10-02'));
    expect(empty).toMatchObject({ openingBirds: 0, mortalityRatePct: null, henDayPct: null });
  });

  it('summarises a batch from its total deaths', () => {
    expect(batchTotals(batch, 55)).toEqual({ liveBirds: 945, cumulativeMortalityPct: 5.5 });
  });
});
