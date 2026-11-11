import type { AlertRule } from './alerts.js';
import type { Severity } from './health.js';
import { SEVERITIES } from './health.js';
import { hasPermission, type Role } from './roles.js';

export const NOTIFICATION_KINDS = ['alert.raised', 'report.ready', 'report.failed'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** In-app notifications are always on; these choose which are also emailed. */
export interface NotificationPreferences {
  /** Email new alerts at or above this severity; null for none. */
  emailAlertsMinSeverity: Severity | null;
  /** Email when a requested report is ready or fails. */
  emailReports: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailAlertsMinSeverity: null,
  emailReports: false,
};

/** Rules about bird health also reach veterinarians and anyone who records health. */
const HEALTH_RULES: readonly AlertRule[] = ['HIGH_DAILY_MORTALITY', 'VACCINATION_OVERDUE'];

/**
 * Who is told about a new alert: the people who act on alerts (acknowledge and
 * resolve them), plus health staff for health rules. Field workers and
 * auditors see alerts in the app but aren't notified.
 */
export function notifiedOfAlert(role: Role, rule: AlertRule): boolean {
  return (
    hasPermission(role, 'production:approve-correction') ||
    (HEALTH_RULES.includes(rule) && hasPermission(role, 'health:record'))
  );
}

export function severityAtLeast(severity: Severity, minimum: Severity): boolean {
  return SEVERITIES.indexOf(severity) >= SEVERITIES.indexOf(minimum);
}
