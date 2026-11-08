export const MOVEMENT_TYPES = [
  'RECEIPT',
  'ISSUE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * Quantities are always positive; the type carries the direction. A stock
 * balance is the signed sum of an item's movements at a farm.
 */
export const MOVEMENT_DIRECTION: Record<MovementType, 1 | -1> = {
  RECEIPT: 1,
  ADJUSTMENT_IN: 1,
  TRANSFER_IN: 1,
  ISSUE: -1,
  ADJUSTMENT_OUT: -1,
  TRANSFER_OUT: -1,
};

/** Types recorded one row at a time; transfers are created in pairs. */
export const SINGLE_MOVEMENT_TYPES = [
  'RECEIPT',
  'ISSUE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const;
export type SingleMovementType = (typeof SINGLE_MOVEMENT_TYPES)[number];
