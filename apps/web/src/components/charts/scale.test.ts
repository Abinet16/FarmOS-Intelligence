import { describe, expect, it } from 'vitest';
import { niceStep, niceTicks, segments } from './scale';

describe('chart scales', () => {
  it('picks 1-2-5 steps', () => {
    expect(niceStep(100, 4)).toBe(20);
    expect(niceStep(7, 4)).toBe(2);
    expect(niceStep(0.9, 4)).toBe(0.2);
    expect(niceStep(400, 4)).toBe(100);
  });

  it('covers the data with whole steps', () => {
    expect(niceTicks(0, 93)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(84.3, 91.2)).toEqual([84, 86, 88, 90, 92]);
  });

  it('gives a flat series some room', () => {
    const ticks = niceTicks(90, 90);
    expect(ticks[0]).toBeLessThan(90);
    expect(ticks.at(-1)).toBeGreaterThan(90);
  });

  it('keeps missing days as gaps', () => {
    const runs = segments([1, null, 2, 3, null], (v) => v);
    expect(runs.map((run) => run.map((p) => p.index))).toEqual([[0], [2, 3]]);
  });
});
