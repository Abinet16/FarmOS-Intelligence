import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, signUp } from './support/app.js';
import { send, type Agent } from './support/fixtures.js';
import { testEnv } from './support/test-env.js';

/** Route limits return 429 with Retry-After, per user, and show up in metrics. */
describe('rate limits', () => {
  let app: INestApplication;
  let owner: Agent;
  let other: Agent;
  let base: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = (await signUp(app, 'limited')).agent;
    other = (await signUp(app, 'unlimited')).agent;
    const org = (await send(owner, 'post', '/api/v1/organizations', { name: 'Limits' }).expect(201))
      .body.id;
    base = `/api/v1/organizations/${org}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const evaluate = (agent: Agent) => send(agent, 'post', `${base}/alerts/evaluate`);

  it('rejects the eleventh alert evaluation in a minute', async () => {
    for (let i = 0; i < 10; i += 1) await evaluate(owner).expect(200);
    const rejected = await evaluate(owner).expect(429);
    expect(Number(rejected.headers['retry-after'])).toBeGreaterThan(0);
    expect(rejected.body.message).toMatch(/Too many requests/);

    // Other routes still answer: only the alert-evaluation bucket is spent.
    await owner.get(`${base}/alerts`).expect(200);
  });

  it('counts each user separately', async () => {
    const org = (await send(other, 'post', '/api/v1/organizations', { name: 'Other' }).expect(201))
      .body.id;
    await send(other, 'post', `/api/v1/organizations/${org}/alerts/evaluate`).expect(200);
  });

  it('does not count requests that fail authentication', async () => {
    for (let i = 0; i < 12; i += 1) {
      await request(app.getHttpServer()).post(`${base}/alerts/evaluate`).expect(401);
    }
  });

  it('records rejections in the metrics', async () => {
    const text = (
      await request(app.getHttpServer())
        .get('/metrics')
        .set('Authorization', `Bearer ${testEnv.METRICS_TOKEN}`)
        .expect(200)
    ).text;
    expect(text).toMatch(/farmos_rate_limited_total\{limit="alert-evaluation"\} [1-9]/);
  });
});
