import { describe, expect, it } from 'vitest';
import { describeParameters, inProgress, rangeDays } from './report-format';

const names = {
  farms: new Map([['farm-1', 'North']]),
  flocks: new Map([['flock-1', 'LAY-01']]),
};

describe('describeParameters', () => {
  it('describes the range and filters', () => {
    expect(
      describeParameters(
        { from: '2026-10-01', to: '2026-10-07', farmId: 'farm-1', batchId: 'flock-1' },
        names,
      ),
    ).toMatch(/2026.*2026, North, LAY-01$/);
  });

  it('describes undated reports as current figures', () => {
    expect(describeParameters({}, names)).toBe('Current figures');
  });

  it('falls back when a farm is no longer listed', () => {
    expect(describeParameters({ farmId: 'gone' }, names)).toBe('Current figures, One farm');
  });
});

describe('inProgress', () => {
  it('is true until the worker finishes', () => {
    expect(inProgress('QUEUED')).toBe(true);
    expect(inProgress('RUNNING')).toBe(true);
    expect(inProgress('SUCCEEDED')).toBe(false);
    expect(inProgress('FAILED')).toBe(false);
  });
});

describe('rangeDays', () => {
  it('counts both ends', () => {
    expect(rangeDays('2026-10-01', '2026-10-07')).toBe(7);
    expect(rangeDays('2026-10-01', '')).toBeNull();
  });
});
