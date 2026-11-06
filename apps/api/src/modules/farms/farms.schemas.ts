import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';
import { booleanParam, searchParam } from '../../common/query/query-params.js';

const name = z.string().trim().min(2).max(120);
const location = z.string().trim().max(200);

export const createFarmSchema = z.object({
  name,
  location: location.optional(),
});
export type CreateFarmDto = z.infer<typeof createFarmSchema>;

export const updateFarmSchema = z
  .object({ name, location: location.nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to update' });
export type UpdateFarmDto = z.infer<typeof updateFarmSchema>;

export const listFarmsSchema = pageQuery.extend({
  q: searchParam.optional(),
  includeArchived: booleanParam.default(false),
});
export type ListFarmsQuery = z.infer<typeof listFarmsSchema>;
