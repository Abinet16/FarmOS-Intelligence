export const FLOCK_PURPOSES = ['LAYER', 'BROILER', 'BREEDER'] as const;
export type FlockPurpose = (typeof FLOCK_PURPOSES)[number];

export const BATCH_STATUSES = ['PLANNED', 'ACTIVE', 'DEPLETED', 'CLOSED'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/**
 * The flock lifecycle. A batch is planned, placed (ACTIVE), depleted when the
 * birds leave the house, and closed once its records are final. A planned
 * batch that never arrives is closed directly. There is no way back: a mistake
 * after placement is fixed through corrections, not by rewinding status.
 */
export const BATCH_TRANSITIONS: Record<BatchStatus, readonly BatchStatus[]> = {
  PLANNED: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['DEPLETED'],
  DEPLETED: ['CLOSED'],
  CLOSED: [],
};

export function canTransition(from: BatchStatus, to: BatchStatus): boolean {
  return BATCH_TRANSITIONS[from].includes(to);
}

/** Statuses in which a batch has left production and carries an end date. */
export function isEnded(status: BatchStatus): boolean {
  return status === 'DEPLETED' || status === 'CLOSED';
}
