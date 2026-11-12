import { describe, expect, it } from 'vitest';
import { filenameFromDisposition } from './download';

describe('filenameFromDisposition', () => {
  it('reads the server-chosen name', () => {
    expect(
      filenameFromDisposition('attachment; filename="mortality_2026-11-01_2026-11-07.csv"', 'x.csv'),
    ).toBe('mortality_2026-11-01_2026-11-07.csv');
  });

  it('falls back when the header is missing or has no name', () => {
    expect(filenameFromDisposition(null, 'report.csv')).toBe('report.csv');
    expect(filenameFromDisposition('attachment', 'report.csv')).toBe('report.csv');
  });
});
