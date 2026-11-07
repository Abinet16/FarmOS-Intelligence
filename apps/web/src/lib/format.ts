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

/** Metrics are stored unrounded; round only for display. Null means not recorded. */
export function formatNumber(value: number | null, digits = 2): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value)}%`;
}

/** Today's date (YYYY-MM-DD) in a time zone, for date inputs. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** FIELD_WORKER → field worker */
export function humanize(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}
