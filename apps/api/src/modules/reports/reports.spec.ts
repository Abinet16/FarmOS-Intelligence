import { canRunReport, REPORT_TYPES, ROLES } from '@farmos/shared-types';
import { requestReportSchema } from './reports.schemas.js';
import { reportFileName } from './reports.service.js';

describe('canRunReport', () => {
  it('limits field workers to their own entries', () => {
    const allowed = Object.keys(REPORT_TYPES).filter((type) =>
      canRunReport('FIELD_WORKER', type as keyof typeof REPORT_TYPES),
    );
    expect(allowed).toEqual(['my_entries']);
  });

  it('lets every role with reports:view run the organization reports', () => {
    for (const role of ['OWNER', 'MANAGER', 'SUPERVISOR', 'VETERINARIAN', 'AUDITOR'] as const) {
      expect(canRunReport(role, 'flock_performance')).toBe(true);
    }
  });

  it("doesn't give auditors or veterinarians 'my entries' (they don't record production)", () => {
    expect(canRunReport('AUDITOR', 'my_entries')).toBe(false);
    expect(canRunReport('VETERINARIAN', 'my_entries')).toBe(false);
  });

  it('gives every role at least one report', () => {
    for (const role of ROLES) {
      expect(
        Object.keys(REPORT_TYPES).some((type) =>
          canRunReport(role, type as keyof typeof REPORT_TYPES),
        ),
      ).toBe(true);
    }
  });
});

describe('reportFileName', () => {
  it('names a dated report by its range', () => {
    expect(
      reportFileName('mortality', { from: '2026-11-01', to: '2026-11-07' }, '2026-11-10'),
    ).toBe('mortality_2026-11-01_2026-11-07.csv');
  });

  it('names an undated report by the day it was made', () => {
    expect(reportFileName('inventory_stock', {}, '2026-11-10')).toBe(
      'inventory_stock_2026-11-10.csv',
    );
  });
});

describe('requestReportSchema', () => {
  it('rejects unknown types, unknown fields and reversed ranges', () => {
    expect(requestReportSchema.safeParse({ type: 'payroll' }).success).toBe(false);
    expect(requestReportSchema.safeParse({ type: 'mortality', organizationId: 'x' }).success).toBe(
      false,
    );
    expect(
      requestReportSchema.safeParse({
        type: 'mortality',
        parameters: { from: '2026-11-07', to: '2026-11-01' },
      }).success,
    ).toBe(false);
  });

  it('accepts a client idempotency key of safe characters only', () => {
    expect(
      requestReportSchema.safeParse({ type: 'alerts', idempotencyKey: 'a1b2c3d4-e5f6' }).success,
    ).toBe(true);
    expect(
      requestReportSchema.safeParse({ type: 'alerts', idempotencyKey: '../../etc' }).success,
    ).toBe(false);
  });
});
