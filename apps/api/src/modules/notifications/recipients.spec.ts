import { notifiedOfAlert, severityAtLeast } from '@farmos/shared-types';

describe('notifiedOfAlert', () => {
  it('notifies the people who act on alerts', () => {
    for (const role of ['OWNER', 'MANAGER', 'SUPERVISOR'] as const) {
      expect(notifiedOfAlert(role, 'LOW_STOCK')).toBe(true);
    }
  });

  it('adds veterinarians for health rules only', () => {
    expect(notifiedOfAlert('VETERINARIAN', 'VACCINATION_OVERDUE')).toBe(true);
    expect(notifiedOfAlert('VETERINARIAN', 'HIGH_DAILY_MORTALITY')).toBe(true);
    expect(notifiedOfAlert('VETERINARIAN', 'LOW_STOCK')).toBe(false);
  });

  it("doesn't notify field workers or auditors", () => {
    expect(notifiedOfAlert('FIELD_WORKER', 'HIGH_DAILY_MORTALITY')).toBe(false);
    expect(notifiedOfAlert('AUDITOR', 'HIGH_DAILY_MORTALITY')).toBe(false);
  });
});

describe('severityAtLeast', () => {
  it('orders severities from low to critical', () => {
    expect(severityAtLeast('CRITICAL', 'HIGH')).toBe(true);
    expect(severityAtLeast('HIGH', 'HIGH')).toBe(true);
    expect(severityAtLeast('MEDIUM', 'HIGH')).toBe(false);
  });
});
