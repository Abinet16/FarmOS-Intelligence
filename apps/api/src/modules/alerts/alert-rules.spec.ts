import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from '@farmos/shared-types';
import type { DailyMetrics } from '../metrics/flock-metrics.js';
import { dedupeKey, flockAlerts, lowStockAlerts, overdueVaccinationAlerts } from './alert-rules.js';

const flock = { id: 'batch-1', batchCode: 'L-01', purpose: 'LAYER' as const };
const settings = DEFAULT_ALERT_SETTINGS;

/** A week of steady layers (90% hen-day, 0.11 kg feed/bird) then the day under test. */
function week(today: Partial<DailyMetrics>): DailyMetrics[] {
  const rows: DailyMetrics[] = [];
  for (let day = 1; day <= 8; day++) {
    rows.push({
      date: `2026-10-0${day}`,
      ageDays: 30 + day,
      openingBirds: 1000,
      deaths: 1,
      closingBirds: 999,
      mortalityRatePct: 0.1,
      cumulativeMortalityPct: 1,
      eggs: 900,
      henDayPct: 90,
      feedKg: 110,
      feedPerBirdKg: 110 / 999.5,
      waterLitres: null,
      averageWeightGrams: null,
    });
  }
  rows[7] = { ...rows[7]!, ...today };
  return rows;
}

const rules = (rows: DailyMetrics[], s: AlertSettings = settings) =>
  flockAlerts(flock, rows, '2026-10-08', s).map((a) => [a.ruleCode, a.severity]);

describe('flock alert rules', () => {
  it('raises nothing for a steady flock', () => {
    expect(rules(week({}))).toEqual([]);
  });

  it('flags daily mortality at the threshold, critical at twice it', () => {
    expect(rules(week({ deaths: 5, mortalityRatePct: 0.5 }))).toEqual([
      ['HIGH_DAILY_MORTALITY', 'HIGH'],
    ]);
    expect(rules(week({ deaths: 10, mortalityRatePct: 1.0 }))).toEqual([
      ['HIGH_DAILY_MORTALITY', 'CRITICAL'],
    ]);
    expect(rules(week({ deaths: 4, mortalityRatePct: 0.4 }))).toEqual([]);
  });

  it('compares hen-day production with the 7-day baseline', () => {
    expect(rules(week({ eggs: 860, henDayPct: 86 }))).toEqual([]); // 4 points
    expect(rules(week({ eggs: 850, henDayPct: 85 }))).toEqual([['HEN_DAY_DROP', 'MEDIUM']]);
    expect(rules(week({ eggs: 800, henDayPct: 80 }))).toEqual([['HEN_DAY_DROP', 'HIGH']]);
  });

  it('needs at least three baseline days before comparing', () => {
    const sparse = week({ eggs: 500, henDayPct: 50 }).map((row, i) =>
      i < 5 ? { ...row, eggs: null, henDayPct: null } : row,
    );
    expect(rules(sparse).filter(([rule]) => rule === 'HEN_DAY_DROP')).toEqual([]);
  });

  it('flags a fall in feed intake of 20% or more', () => {
    const feed = (kg: number) => week({ feedKg: kg, feedPerBirdKg: kg / 999.5 });
    expect(rules(feed(90))).toEqual([]); // ~18%
    expect(rules(feed(88))).toEqual([['FEED_INTAKE_DROP', 'MEDIUM']]); // 20%
  });

  it('flags missing egg counts and feed', () => {
    const [alert] = flockAlerts(
      flock,
      week({ eggs: null, henDayPct: null, feedKg: null, feedPerBirdKg: null }),
      '2026-10-08',
      settings,
    );
    expect(alert).toMatchObject({
      ruleCode: 'MISSING_RECORDS',
      details: { missing: ['eggs', 'feed'] },
    });
  });

  it('respects custom thresholds and disabled rules', () => {
    const strict = { ...settings, dailyMortalityPct: 0.1 };
    expect(rules(week({}), strict)).toEqual([['HIGH_DAILY_MORTALITY', 'HIGH']]);
    const quiet = { ...settings, disabledRules: ['HIGH_DAILY_MORTALITY' as const] };
    expect(rules(week({ deaths: 10, mortalityRatePct: 1 }), quiet)).toEqual([]);
  });

  it('builds stable dedupe keys', () => {
    const [alert] = flockAlerts(
      flock,
      week({ deaths: 9, mortalityRatePct: 0.9 }),
      '2026-10-08',
      settings,
    );
    expect(dedupeKey(alert!)).toBe('HIGH_DAILY_MORTALITY:batch-1:2026-10-08');
  });
});

describe('state alert rules', () => {
  it('flags vaccinations scheduled before today, once per vaccination', () => {
    const alerts = overdueVaccinationAlerts(
      [
        {
          id: 'v1',
          batchId: 'b',
          batchCode: 'L-01',
          vaccineName: 'ND',
          scheduledDate: '2026-10-07',
        },
        {
          id: 'v2',
          batchId: 'b',
          batchCode: 'L-01',
          vaccineName: 'IB',
          scheduledDate: '2026-10-08',
        },
      ],
      '2026-10-08',
      settings,
    );
    expect(alerts.map((a) => [a.subject, a.persistent])).toEqual([['v1', true]]);
  });

  it('flags low stock, high when nothing is left', () => {
    const row = {
      itemId: 'i',
      itemName: 'Layer mash',
      unit: 'kg',
      farmId: 'f',
      farmName: 'North',
      reorderLevel: 500,
    };
    const alerts = lowStockAlerts(
      [
        { ...row, balance: 400, belowReorder: true },
        { ...row, farmId: 'g', balance: 0, belowReorder: true },
        { ...row, farmId: 'h', balance: 900, belowReorder: false },
      ],
      '2026-10-08',
      settings,
    );
    expect(alerts.map((a) => [a.subject, a.severity])).toEqual([
      ['i@f', 'MEDIUM'],
      ['i@g', 'HIGH'],
    ]);
  });
});
