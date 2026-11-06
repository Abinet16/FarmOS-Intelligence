import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';
import { booleanParam, searchParam } from '../../common/query/query-params.js';

const name = z.string().trim().min(1).max(60);
const capacity = z.number().int().min(1).max(1_000_000);

export const createHouseSchema = z.object({
  farmId: z.uuid(),
  name,
  capacity,
});
export type CreateHouseDto = z.infer<typeof createHouseSchema>;

export const updateHouseSchema = z
  .object({ name, capacity })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to update' });
export type UpdateHouseDto = z.infer<typeof updateHouseSchema>;

export const listHousesSchema = pageQuery.extend({
  farmId: z.uuid().optional(),
  q: searchParam.optional(),
  includeArchived: booleanParam.default(false),
});
export type ListHousesQuery = z.infer<typeof listHousesSchema>;
