import { loadEnv } from '../config/env.js';
import { schedules } from './schedules.js';

const env = loadEnv({
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  BETTER_AUTH_URL: 'http://localhost:4000',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
});

describe('schedules', () => {
  it('evaluates alerts hourly in UTC and sweeps every five minutes', () => {
    expect(schedules(env)).toEqual([
      expect.objectContaining({
        id: 'alerts-evaluate-all',
        job: 'alerts.evaluate-all',
        repeat: { pattern: '15 * * * *', tz: 'UTC' },
      }),
      expect.objectContaining({ id: 'maintenance-sweep', repeat: { every: 300_000 } }),
    ]);
  });

  it('takes the alert schedule from the environment', () => {
    const [alerts] = schedules({ ...env, ALERT_EVALUATION_CRON: '0 3 * * *' });
    expect(alerts!.repeat).toEqual({ pattern: '0 3 * * *', tz: 'UTC' });
  });

  it('routes each schedule to its job queue', () => {
    for (const schedule of schedules(env)) {
      expect(schedule.job.startsWith(`${schedule.queue}.`)).toBe(true);
    }
  });
});
