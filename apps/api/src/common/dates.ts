const DAY_MS = 86_400_000;

/**
 * Today's calendar date in an organization's time zone, as UTC midnight (how
 * `date` columns come back from Postgres). A farm in Addis Ababa starts its
 * day three hours before UTC does.
 */
export function todayIn(timeZone: string, now: Date = new Date()): Date {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now); // YYYY-MM-DD
  return new Date(`${local}T00:00:00Z`);
}

/** Whole days from one calendar date to another. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
