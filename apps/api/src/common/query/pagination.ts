import { z } from 'zod';

/**
 * Offset pagination for the configuration lists (farms, houses, batches).
 * These stay small per tenant and the UI needs a total for page controls.
 * Append-heavy history (audit, records) uses keyset pagination instead.
 */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof pageQuery>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs({ page, pageSize }: PageQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(items: T[], total: number, query: PageQuery): Page<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
