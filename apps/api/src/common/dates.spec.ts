import { daysBetween, todayIn } from './dates.js';

describe('calendar dates', () => {
  it('uses the organization’s local date, not UTC', () => {
    const lateEveningUtc = new Date('2026-11-05T22:30:00Z');
    expect(todayIn('UTC', lateEveningUtc).toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(todayIn('Africa/Addis_Ababa', lateEveningUtc).toISOString()).toBe(
      '2026-11-06T00:00:00.000Z',
    );
  });

  it('counts whole days between dates', () => {
    expect(daysBetween(new Date('2026-10-01'), new Date('2026-11-06'))).toBe(36);
    expect(daysBetween(new Date('2026-10-01'), new Date('2026-10-01'))).toBe(0);
  });
});
