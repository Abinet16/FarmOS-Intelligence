import { BadRequestException } from '@nestjs/common';
import { analyticsQuerySchema, resolveRange } from './analytics.schemas.js';

const d = (value: string) => new Date(`${value}T00:00:00Z`);

describe('analytics date ranges', () => {
  it('defaults to the 30 days ending today', () => {
    const range = resolveRange({}, d('2026-11-09'));
    expect(range.from.toISOString().slice(0, 10)).toBe('2026-10-11');
    expect(range.to.toISOString().slice(0, 10)).toBe('2026-11-09');
  });

  it('counts back from an explicit end date', () => {
    const range = resolveRange({ to: d('2026-10-31') }, d('2026-11-09'));
    expect(range.from.toISOString().slice(0, 10)).toBe('2026-10-02');
  });

  it('allows 366 days, counting both ends, and no more', () => {
    expect(() =>
      resolveRange({ from: d('2025-11-08'), to: d('2026-11-09') }, d('2026-11-09')),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveRange({ from: d('2025-11-09'), to: d('2026-11-09') }, d('2026-11-09')),
    ).not.toThrow();
  });

  it('rejects reversed ranges', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2026-11-02', to: '2026-11-01' }).success).toBe(
      false,
    );
  });
});
