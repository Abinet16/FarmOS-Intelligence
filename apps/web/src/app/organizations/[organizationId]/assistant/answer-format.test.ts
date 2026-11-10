import { describe, expect, it } from 'vitest';
import { recordHref, STATUS_LABELS } from './answer-format';

describe('recordHref', () => {
  const base = '/organizations/org-1';

  it('links flocks and farms to their pages', () => {
    expect(recordHref(base, { type: 'flock_batch', id: 'f1', label: 'LAY-01' })).toBe(
      '/organizations/org-1/flocks/f1',
    );
    expect(recordHref(base, { type: 'farm', id: 'farm-1', label: 'North' })).toBe(
      '/organizations/org-1/farms/farm-1',
    );
  });

  it('sends items without a page to their list, or nowhere', () => {
    expect(recordHref(base, { type: 'inventory_item', id: 'i1', label: 'Mash' })).toBe(
      '/organizations/org-1/inventory',
    );
    expect(recordHref(base, { type: 'health_event', id: 'h1', label: 'LAY-01' })).toBeNull();
  });
});

describe('STATUS_LABELS', () => {
  it('gives every status an icon and words, not colour alone', () => {
    for (const { icon, label } of Object.values(STATUS_LABELS)) {
      expect(icon).not.toBe('');
      expect(label.split(' ').length).toBeGreaterThan(2);
    }
  });
});
