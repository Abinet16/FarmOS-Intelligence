import { z } from 'zod';

/** Query strings are text; `z.coerce.boolean()` would read "false" as true. */
export const booleanParam = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Free-text search: trimmed, and treated as absent when empty. */
export const searchParam = z
  .string()
  .trim()
  .max(100)
  .transform((value) => value || undefined);

/** A calendar date (YYYY-MM-DD), stored as a Postgres `date` at UTC midnight. */
export const calendarDate = z.iso.date().transform((value) => new Date(`${value}T00:00:00Z`));
