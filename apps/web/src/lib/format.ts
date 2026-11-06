/** API dates are calendar dates at UTC midnight; show them without shifting. */
export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/** FIELD_WORKER → field worker */
export function humanize(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}
