import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetRange } from './date-range-filter';

describe('presetRange', () => {
  afterEach(() => vi.useRealTimers());

  it('ends today in the organization’s time zone and counts both ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T22:30:00Z')); // already Nov 9 in Addis Ababa
    expect(presetRange(7, 'Africa/Addis_Ababa')).toEqual({ from: '2026-11-03', to: '2026-11-09' });
    expect(presetRange(7, 'UTC')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('crosses month boundaries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));
    expect(presetRange(30, 'UTC').from).toBe('2026-02-04');
  });
});
