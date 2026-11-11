import { queueOf } from './jobs.js';

describe('queueOf', () => {
  it('routes a job to the queue named before the dot', () => {
    expect(queueOf('reports.generate')).toBe('reports');
    expect(queueOf('alerts.evaluate-all')).toBe('alerts');
    expect(queueOf('email.send')).toBe('email');
    expect(queueOf('maintenance.sweep')).toBe('maintenance');
  });
});
