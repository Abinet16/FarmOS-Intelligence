import { ALERT_RULES, ALERT_STATUSES, SEVERITIES, type AlertRule } from '@farmos/shared-types';
import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';
import { calendarDate } from '../../common/query/query-params.js';

const ruleCodes = Object.keys(ALERT_RULES) as [AlertRule, ...AlertRule[]];

export const alertSettingsSchema = z.object({
  dailyMortalityPct: z.number().gt(0).max(100),
  henDayDropPoints: z.number().gt(0).max(100),
  feedDropPct: z.number().gt(0).max(100),
  disabledRules: z.array(z.enum(ruleCodes)).max(ruleCodes.length),
});
export type AlertSettingsDto = z.infer<typeof alertSettingsSchema>;

export const evaluateAlertsSchema = z.object({
  /** Defaults to yesterday in the organization's time zone, the last complete day. */
  date: calendarDate.optional(),
});
export type EvaluateAlertsDto = z.infer<typeof evaluateAlertsSchema>;

export const listAlertsSchema = pageQuery.extend({
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  batchId: z.uuid().optional(),
  /** Everything not yet resolved. */
  open: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type ListAlertsQuery = z.infer<typeof listAlertsSchema>;
