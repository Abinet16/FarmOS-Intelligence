import { alertDigests, type Member, type NewAlert } from './alert-notifications.js';

const members: Member[] = [
  { userId: 'owner', role: 'OWNER' },
  { userId: 'vet', role: 'VETERINARIAN' },
  { userId: 'worker', role: 'FIELD_WORKER' },
  { userId: 'auditor', role: 'AUDITOR' },
];

const alerts: NewAlert[] = [
  { id: 'b', ruleCode: 'MISSING_RECORDS', severity: 'MEDIUM' },
  { id: 'c', ruleCode: 'MISSING_RECORDS', severity: 'MEDIUM' },
  { id: 'a', ruleCode: 'HIGH_DAILY_MORTALITY', severity: 'CRITICAL' },
];

describe('alertDigests', () => {
  it('sends one summary per recipient', () => {
    const drafts = alertDigests(alerts, members, '2026-11-10');
    expect(drafts.map((draft) => draft.userId)).toEqual(['owner', 'vet']);
    const [owner] = drafts;
    expect(owner).toMatchObject({
      kind: 'alert.raised',
      title: '3 new alerts for 2026-11-10',
      body: '1 critical, 2 medium: missing records (2), high daily mortality (1).',
      link: '/alerts',
      severity: 'CRITICAL',
    });
  });

  it('tells veterinarians only about health alerts', () => {
    const vet = alertDigests(alerts, members, '2026-11-10').find((d) => d.userId === 'vet');
    expect(vet).toMatchObject({
      title: 'New critical alert for 2026-11-10',
      body: '1 critical: high daily mortality (1).',
    });
  });

  it('uses the same dedupe key for every recipient of one evaluation', () => {
    const keys = new Set(alertDigests(alerts, members, '2026-11-10').map((d) => d.dedupeKey));
    expect(keys).toEqual(new Set(['alerts-a']));
  });

  it('notifies nobody when nothing new was raised', () => {
    expect(alertDigests([], members, '2026-11-10')).toEqual([]);
  });
});
