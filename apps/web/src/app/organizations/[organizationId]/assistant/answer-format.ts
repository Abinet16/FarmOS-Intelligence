import type { AnswerStatus, RecordRef } from '@farmos/shared-types';

/**
 * How each outcome is labelled. An icon and a word always accompany the
 * colour, so the status never relies on colour alone.
 */
export const STATUS_LABELS: Record<AnswerStatus, { icon: string; label: string; tone: string }> = {
  ANSWERED: { icon: '✓', label: 'Answered from your records', tone: 'var(--chart-axis)' },
  INSUFFICIENT_DATA: {
    icon: '!',
    label: 'Not enough recorded data',
    tone: 'var(--status-warning)',
  },
  OUT_OF_SCOPE: { icon: '⊘', label: 'Outside what the assistant does', tone: 'var(--chart-axis)' },
};

/** Where a cited record lives in the app, if it has a page of its own. */
export function recordHref(base: string, ref: RecordRef): string | null {
  switch (ref.type) {
    case 'flock_batch':
      return `${base}/flocks/${ref.id}`;
    case 'farm':
      return `${base}/farms/${ref.id}`;
    case 'inventory_item':
      return `${base}/inventory`;
    case 'alert':
      return `${base}/dashboard`;
    default:
      return null;
  }
}

/** Questions that show what the assistant is for, on an empty conversation. */
export const EXAMPLE_QUESTIONS = [
  'Which flock had the highest mortality rate over the last 7 days, and how much feed did it consume?',
  'How did hen-day production compare between our farms this month?',
  'Are any vaccinations overdue?',
  'Which inventory items are below their reorder level?',
];
