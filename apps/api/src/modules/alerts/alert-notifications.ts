import {
  ALERT_RULES,
  notifiedOfAlert,
  SEVERITIES,
  type AlertRule,
  type Role,
  type Severity,
} from '@farmos/shared-types';
import type { NotificationDraft } from '../notifications/notifications.service.js';

export interface NewAlert {
  id: string;
  ruleCode: string;
  severity: Severity;
}

export interface Member {
  userId: string;
  role: Role;
}

const SHORT_NAMES: Record<AlertRule, string> = {
  HIGH_DAILY_MORTALITY: 'high daily mortality',
  HEN_DAY_DROP: 'hen-day drop',
  FEED_INTAKE_DROP: 'feed intake drop',
  MISSING_RECORDS: 'missing records',
  VACCINATION_OVERDUE: 'overdue vaccination',
  LOW_STOCK: 'low stock',
};

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/**
 * One notification per recipient per evaluation, summarizing the alerts that
 * concern them, instead of one per alert: a farm with many flocks would
 * otherwise get a notification for every missing record.
 */
export function alertDigests(
  alerts: readonly NewAlert[],
  members: readonly Member[],
  date: string,
): NotificationDraft[] {
  if (alerts.length === 0) return [];
  // The first new alert identifies this evaluation's batch: re-running a job
  // that already notified finds the same alert and skips the duplicate.
  const batchKey = [...alerts].map((alert) => alert.id).sort()[0];

  return members.flatMap((member) => {
    const relevant = alerts.filter((alert) =>
      notifiedOfAlert(member.role, alert.ruleCode as AlertRule),
    );
    if (relevant.length === 0) return [];

    const severity = relevant.reduce<Severity>(
      (worst, alert) =>
        SEVERITIES.indexOf(alert.severity) > SEVERITIES.indexOf(worst) ? alert.severity : worst,
      'LOW',
    );
    const bySeverity = [...SEVERITIES]
      .reverse()
      .map((level) => [level, relevant.filter((alert) => alert.severity === level).length] as const)
      .filter(([, count]) => count > 0)
      .map(([level, count]) => `${count} ${level.toLowerCase()}`)
      .join(', ');
    const byRule = [...countBy(relevant, (alert) => alert.ruleCode)]
      .map(
        ([rule, count]) =>
          `${SHORT_NAMES[rule as AlertRule] ?? ALERT_RULES[rule as AlertRule]} (${count})`,
      )
      .join(', ');

    return [
      {
        userId: member.userId,
        kind: 'alert.raised' as const,
        title:
          relevant.length === 1
            ? `New ${severity.toLowerCase()} alert for ${date}`
            : `${relevant.length} new alerts for ${date}`,
        body: `${bySeverity}: ${byRule}.`,
        link: '/alerts',
        dedupeKey: `alerts-${batchKey}`,
        severity,
      },
    ];
  });
}
