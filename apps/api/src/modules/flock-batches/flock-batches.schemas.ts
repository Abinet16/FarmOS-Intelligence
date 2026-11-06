import { BATCH_STATUSES, FLOCK_PURPOSES } from '@farmos/shared-types';
import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';
import { calendarDate, searchParam } from '../../common/query/query-params.js';

const batchCode = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'letters, digits and . _ / - only');
const breed = z.string().trim().min(2).max(80);
const initialBirds = z.number().int().min(1).max(1_000_000);
const notes = z.string().trim().max(2000);

export const createFlockBatchSchema = z.object({
  houseId: z.uuid(),
  batchCode,
  breed,
  purpose: z.enum(FLOCK_PURPOSES).default('LAYER'),
  placementDate: calendarDate,
  initialBirds,
  notes: notes.optional(),
});
export type CreateFlockBatchDto = z.infer<typeof createFlockBatchSchema>;

/**
 * House, placement date and bird count describe the placement itself, so they
 * can only change while the batch is still PLANNED.
 */
export const updateFlockBatchSchema = z
  .object({
    houseId: z.uuid(),
    batchCode,
    breed,
    purpose: z.enum(FLOCK_PURPOSES),
    placementDate: calendarDate,
    initialBirds,
    notes: notes.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to update' });
export type UpdateFlockBatchDto = z.infer<typeof updateFlockBatchSchema>;

export const PLACEMENT_FIELDS = ['houseId', 'placementDate', 'initialBirds'] as const;

export const changeStatusSchema = z.object({
  status: z.enum(BATCH_STATUSES),
  /** End date for DEPLETED/CLOSED; defaults to today in the organization's time zone. */
  date: calendarDate.optional(),
});
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;

export const listFlockBatchesSchema = pageQuery.extend({
  status: z.enum(BATCH_STATUSES).optional(),
  purpose: z.enum(FLOCK_PURPOSES).optional(),
  farmId: z.uuid().optional(),
  houseId: z.uuid().optional(),
  q: searchParam.optional(),
});
export type ListFlockBatchesQuery = z.infer<typeof listFlockBatchesSchema>;
