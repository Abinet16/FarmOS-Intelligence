import { z } from 'zod';
import { calendarDate } from '../../common/query/query-params.js';
import { invalidField } from '../../common/pipes/zod-validation.pipe.js';

const DAY_MS = 86_400_000;
export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;

export const analyticsQuerySchema = z
  .object({
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    farmId: z.uuid().optional(),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: 'from must not be after to',
    path: ['from'],
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface DateRange {
  from: Date;
  to: Date;
}

/** Defaults to the 30 days ending today in the organization's time zone. */
export function resolveRange(query: Pick<AnalyticsQuery, 'from' | 'to'>, today: Date): DateRange {
  const to = query.to ?? today;
  const from = query.from ?? new Date(to.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if ((to.getTime() - from.getTime()) / DAY_MS >= MAX_RANGE_DAYS) {
    throw invalidField('from', `the range can span at most ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}
