import { MORTALITY_REASONS } from '@farmos/shared-types';
import { z } from 'zod';
import { calendarDate } from '../../common/query/query-params.js';

const eggsCollected = z.number().int().min(0).max(1_000_000);
const waterLitres = z.number().min(0).max(1_000_000);
const notes = z.string().trim().max(2000);

/**
 * Everything recorded for one batch on one day, saved atomically. Each part is
 * optional, so the same form serves a full end-of-day entry and a quick
 * mortality report at noon.
 */
export const dailyEntrySchema = z
  .object({
    date: calendarDate,
    eggsCollected: eggsCollected.optional(),
    waterLitres: waterLitres.optional(),
    notes: notes.optional(),
    deaths: z
      .array(
        z.object({
          quantity: z.number().int().min(1).max(1_000_000),
          reasonCode: z.enum(MORTALITY_REASONS),
          notes: notes.optional(),
        }),
      )
      .max(10)
      .default([]),
    feed: z
      .array(
        z.object({
          feedTypeId: z.uuid(),
          quantityKg: z.number().gt(0).max(100_000),
        }),
      )
      .max(10)
      .default([]),
    weight: z
      .object({
        sampleSize: z.number().int().min(1).max(10_000),
        averageWeightGrams: z.number().gt(0).max(15_000),
      })
      .optional(),
  })
  .refine(
    (entry) =>
      entry.eggsCollected !== undefined ||
      entry.waterLitres !== undefined ||
      entry.deaths.length > 0 ||
      entry.feed.length > 0 ||
      entry.weight !== undefined,
    { message: 'record at least one of eggs, water, deaths, feed or weight' },
  );
export type DailyEntryDto = z.infer<typeof dailyEntrySchema>;

export const updateProductionLogSchema = z
  .object({ eggsCollected, waterLitres: waterLitres.nullable(), notes: notes.nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to update' });
export type UpdateProductionLogDto = z.infer<typeof updateProductionLogSchema>;

export const dateRangeSchema = z
  .object({ from: calendarDate.optional(), to: calendarDate.optional() })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: 'from must not be after to',
    path: ['from'],
  });
export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
