import type { AlertRule, AlertSettings, FlockPurpose, Severity } from '@farmos/shared-types';
import { laysEggs, windowKpis, windowTotals, type DailyMetrics } from '../metrics/flock-metrics.js';

/** Days of history a flock rule compares against. */
export const BASELINE_DAYS = 7;
/** A baseline needs at least this many recorded days to be trusted. */
const MIN_BASELINE_DAYS = 3;

export interface AlertCandidate {
  ruleCode: AlertRule;
  severity: Severity;
  batchId: string | null;
  /** What the alert is about: a flock, a vaccination, an item at a farm. */
  subject: string;
  /** The day it was raised for. */
  period: string;
  /**
   * Persistent conditions (overdue, low stock) raise one alert until it is
   * resolved, rather than one per day.
   */
  persistent: boolean;
  details: Record<string, string | number | null | string[]>;
}

/** Deterministic, so re-running an evaluation can never duplicate an alert. */
export function dedupeKey(candidate: Pick<AlertCandidate, 'ruleCode' | 'subject' | 'period'>) {
  return `${candidate.ruleCode}:${candidate.subject}:${candidate.period}`;
}

export function subjectPrefix(candidate: Pick<AlertCandidate, 'ruleCode' | 'subject'>) {
  return `${candidate.ruleCode}:${candidate.subject}:`;
}

interface Flock {
  id: string;
  batchCode: string;
  purpose: FlockPurpose;
}

/**
 * Rules over one flock's daily metrics. `rows` covers the evaluation day and
 * up to BASELINE_DAYS before it; the baseline is the earlier days only.
 */
export function flockAlerts(
  flock: Flock,
  rows: readonly DailyMetrics[],
  date: string,
  settings: AlertSettings,
): AlertCandidate[] {
  const today = rows.find((row) => row.date === date);
  if (!today) return [];
  const baselineRows = rows.filter((row) => row.date < date);
  const baseline = windowTotals(baselineRows, flock.purpose);
  const baselineKpis = windowKpis(baseline);

  const raise = (
    ruleCode: AlertRule,
    severity: Severity,
    details: AlertCandidate['details'],
  ): AlertCandidate => ({
    ruleCode,
    severity,
    batchId: flock.id,
    subject: flock.id,
    period: date,
    persistent: false,
    details: { batchCode: flock.batchCode, date, ...details },
  });
  const alerts: AlertCandidate[] = [];

  const mortality = today.mortalityRatePct;
  if (mortality !== null && today.deaths > 0 && mortality >= settings.dailyMortalityPct) {
    alerts.push(
      raise(
        'HIGH_DAILY_MORTALITY',
        mortality >= settings.dailyMortalityPct * 2 ? 'CRITICAL' : 'HIGH',
        {
          deaths: today.deaths,
          mortalityRatePct: mortality,
          thresholdPct: settings.dailyMortalityPct,
        },
      ),
    );
  }

  if (
    laysEggs(flock.purpose) &&
    today.henDayPct !== null &&
    baselineKpis.henDayPct !== null &&
    baseline.daysWithEggs >= MIN_BASELINE_DAYS
  ) {
    const drop = baselineKpis.henDayPct - today.henDayPct;
    if (drop >= settings.henDayDropPoints) {
      alerts.push(
        raise('HEN_DAY_DROP', drop >= settings.henDayDropPoints * 2 ? 'HIGH' : 'MEDIUM', {
          henDayPct: today.henDayPct,
          baselinePct: baselineKpis.henDayPct,
          dropPoints: drop,
        }),
      );
    }
  }

  if (
    today.feedPerBirdKg !== null &&
    baselineKpis.feedPerBirdKg !== null &&
    baseline.daysWithFeed >= MIN_BASELINE_DAYS
  ) {
    const dropPct = (1 - today.feedPerBirdKg / baselineKpis.feedPerBirdKg) * 100;
    if (dropPct >= settings.feedDropPct) {
      alerts.push(
        raise('FEED_INTAKE_DROP', 'MEDIUM', {
          feedPerBirdKg: today.feedPerBirdKg,
          baselineKg: baselineKpis.feedPerBirdKg,
          dropPct,
        }),
      );
    }
  }

  // A flock placed today hasn't had a full day to record yet.
  if (today.ageDays > 0) {
    const missing = [
      ...(laysEggs(flock.purpose) && today.eggs === null ? ['eggs'] : []),
      ...(today.feedKg === null ? ['feed'] : []),
    ];
    if (missing.length > 0) alerts.push(raise('MISSING_RECORDS', 'LOW', { missing }));
  }

  return alerts.filter((alert) => !settings.disabledRules.includes(alert.ruleCode));
}

export function overdueVaccinationAlerts(
  vaccinations: readonly {
    id: string;
    batchId: string;
    batchCode: string;
    vaccineName: string;
    scheduledDate: string;
  }[],
  date: string,
  settings: AlertSettings,
): AlertCandidate[] {
  if (settings.disabledRules.includes('VACCINATION_OVERDUE')) return [];
  return vaccinations
    .filter((v) => v.scheduledDate < date)
    .map((v) => ({
      ruleCode: 'VACCINATION_OVERDUE' as const,
      severity: 'MEDIUM' as const,
      batchId: v.batchId,
      subject: v.id,
      period: date,
      persistent: true,
      details: { batchCode: v.batchCode, vaccine: v.vaccineName, scheduledDate: v.scheduledDate },
    }));
}

export function lowStockAlerts(
  stock: readonly {
    itemId: string;
    itemName: string;
    unit: string;
    farmId: string;
    farmName: string;
    balance: number;
    reorderLevel: number | null;
    belowReorder: boolean;
  }[],
  date: string,
  settings: AlertSettings,
): AlertCandidate[] {
  if (settings.disabledRules.includes('LOW_STOCK')) return [];
  return stock
    .filter((row) => row.belowReorder)
    .map((row) => ({
      ruleCode: 'LOW_STOCK' as const,
      severity: row.balance <= 0 ? ('HIGH' as const) : ('MEDIUM' as const),
      batchId: null,
      subject: `${row.itemId}@${row.farmId}`,
      period: date,
      persistent: true,
      details: {
        item: row.itemName,
        farm: row.farmName,
        balance: row.balance,
        reorderLevel: row.reorderLevel,
        unit: row.unit,
      },
    }));
}
