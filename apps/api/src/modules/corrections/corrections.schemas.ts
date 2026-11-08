import { CORRECTION_STATUSES } from '@farmos/shared-types';
import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';

export const requestCorrectionSchema = z.object({
  changes: z
    .object({
      eggsCollected: z.number().int().min(0).max(1_000_000),
      waterLitres: z.number().min(0).max(1_000_000).nullable(),
      notes: z.string().trim().max(2000).nullable(),
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0, { message: 'propose at least one change' }),
  reason: z.string().trim().min(3).max(500),
});
export type RequestCorrectionDto = z.infer<typeof requestCorrectionSchema>;
export type ProposedChanges = RequestCorrectionDto['changes'];

export const reviewCorrectionSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type ReviewCorrectionDto = z.infer<typeof reviewCorrectionSchema>;

export const rejectCorrectionSchema = z.object({
  note: z.string().trim().min(3).max(500),
});

export const listCorrectionsSchema = pageQuery.extend({
  status: z.enum(CORRECTION_STATUSES).optional(),
  batchId: z.uuid().optional(),
});
export type ListCorrectionsQuery = z.infer<typeof listCorrectionsSchema>;
