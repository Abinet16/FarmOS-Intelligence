export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * What was observed, not a diagnosis. FarmOS records observations and leaves
 * diagnosis and treatment to a veterinarian.
 */
export const HEALTH_CATEGORIES = [
  'RESPIRATORY',
  'DIGESTIVE',
  'NEUROLOGICAL',
  'SKIN_AND_FEATHERS',
  'LEG_AND_MOBILITY',
  'BEHAVIOUR',
  'PARASITES',
  'INJURY',
  'OTHER',
] as const;
export type HealthCategory = (typeof HEALTH_CATEGORIES)[number];

export const RESOLUTION_STATUSES = ['OPEN', 'MONITORING', 'RESOLVED'] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

/** A scheduled vaccination is administered, missed or cancelled; each is final. */
export const VACCINATION_STATUSES = ['SCHEDULED', 'ADMINISTERED', 'MISSED', 'CANCELLED'] as const;
export type VaccinationStatus = (typeof VACCINATION_STATUSES)[number];

export const CORRECTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];
