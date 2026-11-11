import { JOB_STATUSES, REPORT_TYPES, type ReportType } from '@farmos/shared-types';
import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';

export const reportType = z.enum(Object.keys(REPORT_TYPES) as [ReportType, ...ReportType[]]);

/** Dates stay YYYY-MM-DD strings: they are stored with the job as requested. */
export const reportParametersSchema = z
  .strictObject({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    farmId: z.uuid().optional(),
    batchId: z.uuid().optional(),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: 'from must not be after to',
    path: ['from'],
  });
export type ReportParametersDto = z.infer<typeof reportParametersSchema>;

export const requestReportSchema = z.strictObject({
  type: reportType,
  parameters: reportParametersSchema.default({}),
  /**
   * Chosen by the client (a UUID per form submission), so a retried request
   * returns the job it already created instead of starting another.
   */
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/, 'use 8-100 letters, digits, - or _')
    .optional(),
});
export type RequestReportDto = z.infer<typeof requestReportSchema>;

export const listReportsSchema = pageQuery.extend({
  status: z.enum(JOB_STATUSES).optional(),
});
export type ListReportsQuery = z.infer<typeof listReportsSchema>;
