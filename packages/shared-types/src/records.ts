export const MORTALITY_REASONS = [
  'DISEASE',
  'INJURY',
  'PREDATOR',
  'HEAT_STRESS',
  'CULLED',
  'UNKNOWN',
  'OTHER',
] as const;
export type MortalityReason = (typeof MORTALITY_REASONS)[number];

/**
 * A production log is SUBMITTED by whoever records it and can be edited until
 * a supervisor APPROVES it. Approved logs only change through corrections.
 */
export const RECORD_STATUSES = ['SUBMITTED', 'APPROVED'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];
