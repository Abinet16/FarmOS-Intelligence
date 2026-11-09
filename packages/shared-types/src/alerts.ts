export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * Alert rules. Each one checks recorded data against a threshold; none of them
 * infers a cause. Descriptions are shown next to the alert in the UI.
 */
export const ALERT_RULES = {
  HIGH_DAILY_MORTALITY: 'Daily mortality at or above the threshold',
  HEN_DAY_DROP: 'Hen-day production fell below the flock’s 7-day baseline',
  FEED_INTAKE_DROP: 'Feed per bird fell below the flock’s 7-day baseline',
  MISSING_RECORDS: 'An active flock has no egg count or feed record for the day',
  VACCINATION_OVERDUE: 'A scheduled vaccination is past its date',
  LOW_STOCK: 'Stock at a farm is at or below the item’s reorder level',
} as const;
export type AlertRule = keyof typeof ALERT_RULES;

export interface AlertSettings {
  /** Daily mortality, % of opening birds. Twice this is critical. */
  dailyMortalityPct: number;
  /** Drop in hen-day production, percentage points below baseline. Twice this is high. */
  henDayDropPoints: number;
  /** Drop in feed per bird, % below baseline. */
  feedDropPct: number;
  /** Rules switched off for the organization. */
  disabledRules: AlertRule[];
}

/** Conservative defaults for commercial layer and broiler flocks. */
export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  dailyMortalityPct: 0.5,
  henDayDropPoints: 5,
  feedDropPct: 20,
  disabledRules: [],
};
