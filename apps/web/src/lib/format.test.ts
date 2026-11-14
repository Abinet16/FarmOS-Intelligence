import { describe, expect, it } from 'vitest';
import { describeAction, humanize } from './format';

describe('humanize', () => {
  it('turns enum values into lowercase words', () => {
    expect(humanize('FIELD_WORKER')).toBe('field worker');
  });
});

describe('describeAction', () => {
  it('reads an audit action as a sentence', () => {
    expect(describeAction('farm.created')).toBe('Farm created');
    expect(describeAction('flock_batch.status_changed')).toBe('Flock batch status changed');
    expect(describeAction('inventory.movement_recorded')).toBe('Inventory movement recorded');
  });
});
