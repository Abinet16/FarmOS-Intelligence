import { randomUUID } from 'node:crypto';
import type { Env } from '../src/config/env.js';
import { Heartbeat } from '../src/observability/heartbeat.js';
import { testEnv } from './support/test-env.js';

/** The worker heartbeat against a real Redis, and against one that isn't there. */
describe('heartbeat', () => {
  const heartbeats: Heartbeat[] = [];
  const make = (redisUrl: string, prefix: string) => {
    const heartbeat = new Heartbeat({ REDIS_URL: redisUrl, QUEUE_PREFIX: prefix } as Env);
    heartbeats.push(heartbeat);
    return heartbeat;
  };

  afterAll(async () => {
    await Promise.all(heartbeats.map((heartbeat) => heartbeat.onModuleDestroy()));
  });

  it('sees a worker once it reports in, per queue prefix', async () => {
    const prefix = `farmos-test-${randomUUID()}`;
    const api = make(testEnv.REDIS_URL, prefix);
    await expect(api.redisStatus()).resolves.toBe('up');
    await expect(api.workerStatus()).resolves.toBe('down');

    make(testEnv.REDIS_URL, prefix).start('test-worker');
    await vi.waitFor(() => expect(api.workerStatus()).resolves.toBe('up'));

    const otherEnvironment = make(testEnv.REDIS_URL, `${prefix}-other`);
    await expect(otherEnvironment.workerStatus()).resolves.toBe('down');
  });

  it('reports down quickly, and in parallel, when redis is unreachable', async () => {
    const api = make('redis://127.0.0.1:1', 'farmos-test');
    const started = Date.now();
    await expect(Promise.all([api.redisStatus(), api.workerStatus()])).resolves.toEqual([
      'down',
      'down',
    ]);
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
