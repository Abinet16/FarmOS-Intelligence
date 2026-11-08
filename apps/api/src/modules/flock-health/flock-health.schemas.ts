import {
  HEALTH_CATEGORIES,
  RESOLUTION_STATUSES,
  SEVERITIES,
  VACCINATION_STATUSES,
} from '@farmos/shared-types';
import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';
import { calendarDate } from '../../common/query/query-params.js';

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const vaccineSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /** Days until a booster is due; null when the vaccine is given once. */
  recommendedIntervalDays: z.number().int().min(1).max(730).nullable().default(null),
});
export type VaccineDto = z.infer<typeof vaccineSchema>;

export const updateVaccineSchema = z
  .object({
    name: vaccineSchema.shape.name,
    recommendedIntervalDays: z.number().int().min(1).max(730).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to update' });
export type UpdateVaccineDto = z.infer<typeof updateVaccineSchema>;

export const scheduleVaccinationSchema = z.object({
  vaccineId: z.uuid(),
  scheduledDate: calendarDate,
});
export type ScheduleVaccinationDto = z.infer<typeof scheduleVaccinationSchema>;

export const vaccinationOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ADMINISTERED'),
    /** Defaults to now. */
    administeredAt: instant.optional(),
    /** Also schedule the booster, if the vaccine has a recommended interval. */
    scheduleNext: z.boolean().default(false),
  }),
  z.object({ status: z.enum(['MISSED', 'CANCELLED']) }),
]);
export type VaccinationOutcomeDto = z.infer<typeof vaccinationOutcomeSchema>;

export const listVaccinationsSchema = pageQuery.extend({
  batchId: z.uuid().optional(),
  status: z.enum(VACCINATION_STATUSES).optional(),
  /** Scheduled vaccinations due within this many days, including overdue ones. */
  dueWithinDays: z.coerce.number().int().min(0).max(365).optional(),
});
export type ListVaccinationsQuery = z.infer<typeof listVaccinationsSchema>;

export const healthEventSchema = z.object({
  /** Defaults to now. */
  observedAt: instant.optional(),
  category: z.enum(HEALTH_CATEGORIES),
  severity: z.enum(SEVERITIES),
  description: z.string().trim().min(3).max(2000),
});
export type HealthEventDto = z.infer<typeof healthEventSchema>;

export const updateHealthEventSchema = z.object({
  resolutionStatus: z.enum(RESOLUTION_STATUSES),
});
export type UpdateHealthEventDto = z.infer<typeof updateHealthEventSchema>;

export const listHealthEventsSchema = pageQuery.extend({
  batchId: z.uuid().optional(),
  resolutionStatus: z.enum(RESOLUTION_STATUSES).optional(),
  severity: z.enum(SEVERITIES).optional(),
});
export type ListHealthEventsQuery = z.infer<typeof listHealthEventsSchema>;
