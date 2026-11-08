import { SINGLE_MOVEMENT_TYPES } from '@farmos/shared-types';
import { z } from 'zod';
import { booleanParam } from '../../common/query/query-params.js';

const quantity = z.number().gt(0).max(10_000_000);
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const reference = z.string().trim().max(120);

export const createItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /** The unit every quantity of this item is counted in: kg, bag, dose, litre… */
  unit: z.string().trim().min(1).max(20),
  reorderLevel: z.number().min(0).max(10_000_000).nullable().default(null),
});
export type CreateItemDto = z.infer<typeof createItemSchema>;

/** The unit can't change once stock is counted in it. */
export const updateItemSchema = z
  .object({ name: createItemSchema.shape.name, reorderLevel: z.number().min(0).nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to update' });
export type UpdateItemDto = z.infer<typeof updateItemSchema>;

export const movementSchema = z.object({
  itemId: z.uuid(),
  farmId: z.uuid(),
  movementType: z.enum(SINGLE_MOVEMENT_TYPES),
  quantity,
  occurredAt: instant.optional(),
  reference: reference.optional(),
});
export type MovementDto = z.infer<typeof movementSchema>;

export const transferSchema = z
  .object({
    itemId: z.uuid(),
    fromFarmId: z.uuid(),
    toFarmId: z.uuid(),
    quantity,
    occurredAt: instant.optional(),
    reference: reference.optional(),
  })
  .refine((t) => t.fromFarmId !== t.toFarmId, {
    message: 'must differ from the source farm',
    path: ['toFarmId'],
  });
export type TransferDto = z.infer<typeof transferSchema>;

export const stockQuerySchema = z.object({
  farmId: z.uuid().optional(),
  itemId: z.uuid().optional(),
  belowReorder: booleanParam.default(false),
});
export type StockQuery = z.infer<typeof stockQuerySchema>;

export const movementsQuerySchema = z.object({
  itemId: z.uuid().optional(),
  farmId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.uuid().optional(),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;
