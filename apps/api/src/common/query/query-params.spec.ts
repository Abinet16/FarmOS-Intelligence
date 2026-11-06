import { pageArgs, pageQuery } from './pagination.js';
import { booleanParam, calendarDate, searchParam } from './query-params.js';

describe('query parameters', () => {
  it('reads "false" as false', () => {
    expect(booleanParam.parse('false')).toBe(false);
    expect(booleanParam.parse('true')).toBe(true);
    expect(booleanParam.safeParse('yes').success).toBe(false);
  });

  it('treats a blank search as absent', () => {
    expect(searchParam.parse('   ')).toBeUndefined();
    expect(searchParam.parse(' north ')).toBe('north');
  });

  it('parses calendar dates at UTC midnight and rejects impossible ones', () => {
    expect(calendarDate.parse('2026-10-01').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(calendarDate.safeParse('2026-02-30').success).toBe(false);
  });

  it('defaults and bounds pagination', () => {
    expect(pageQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(pageQuery.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(pageArgs(pageQuery.parse({ page: '3', pageSize: '10' }))).toEqual({
      skip: 20,
      take: 10,
    });
  });
});
