import { Worker } from 'bullmq';
import { BullmqJobQueue, ENQUEUE_TIMEOUT_MS } from '../src/jobs/bullmq-job-queue.js';
import { queueSettings } from '../src/jobs/jobs.module.js';
import { loadEnv } from '../src/config/env.js';

/**
 * The BullMQ queue against a real Redis (REDIS_URL), under a key prefix of its
 * own so it never touches development queues.
 */
describe('job queue (Redis)', () => {
  const env = loadEnv({ ...process.env, QUEUE_PREFIX: `farmos-test-${Date.now()}` });
  const settings = queueSettings(env);
  let queue: BullmqJobQueue;

  beforeAll(() => {
    queue = new BullmqJobQueue(settings);
  });

  afterAll(async () => {
    for (const name of ['reports', 'email'] as const) {
      await queue.queue(name).obliterate({ force: true });
    }
    await queue.onModuleDestroy();
  });

  it('adds a job once per job id, so retried requests never duplicate work', async () => {
    const data = { organizationId: 'org-1', reportJobId: 'job-1' };
    expect(await queue.enqueue('reports.generate', data, { jobId: 'report-job-1' })).toBe(true);
    expect(await queue.enqueue('reports.generate', data, { jobId: 'report-job-1' })).toBe(true);
    const counts = await queue.queue('reports').getJobCounts('waiting', 'delayed', 'active');
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it('retries with backoff by default', async () => {
    const [job] = await queue.queue('reports').getJobs(['waiting']);
    expect(job?.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  });

  it('delivers a job to a worker on its queue', async () => {
    const received: unknown[] = [];
    const worker = new Worker(
      'email',
      async (job) => {
        received.push({ name: job.name, data: job.data });
      },
      { connection: { url: env.REDIS_URL, maxRetriesPerRequest: null }, prefix: settings.prefix },
    );
    const done = new Promise((resolve) => worker.on('completed', resolve));
    await queue.enqueue('email.send', { organizationId: 'org-1', notificationId: 'n-1' });
    await done;
    await worker.close();
    expect(received).toEqual([
      { name: 'email.send', data: { organizationId: 'org-1', notificationId: 'n-1' } },
    ]);
  });

  it('reports failure instead of throwing when Redis is unreachable', async () => {
    const offline = new BullmqJobQueue({
      ...settings,
      connection: { ...settings.connection, url: 'redis://localhost:1' },
    });
    const started = Date.now();
    expect(
      await offline.enqueue('email.send', { organizationId: 'org-1', notificationId: 'n-2' }),
    ).toBe(false);
    expect(Date.now() - started).toBeLessThan(ENQUEUE_TIMEOUT_MS + 1_000);
    await offline.onModuleDestroy();
  });
});
