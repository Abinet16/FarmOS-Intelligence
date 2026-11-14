import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, signUp } from './support/app.js';
import { testEnv, WEB_ORIGIN } from './support/test-env.js';

/** Request ids and the metrics endpoint, through the real middleware stack. */
describe('observability', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const scrape = () =>
    request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${testEnv.METRICS_TOKEN}`)
      .expect(200);

  it('returns a request id on every response, including errors', async () => {
    const ok = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(ok.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const unauthorized = await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    expect(unauthorized.headers['x-request-id']).toBeDefined();
  });

  it('keeps a request id sent by a proxy', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'edge-0123456789')
      .expect(200);
    expect(response.headers['x-request-id']).toBe('edge-0123456789');
  });

  it('lets the web app read the request id across origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    expect(response.headers['access-control-expose-headers']).toMatch(/x-request-id/i);
  });

  it('requires the bearer token for metrics', async () => {
    const rejected = await request(app.getHttpServer()).get('/metrics').expect(401);
    expect(rejected.headers['content-type']).toMatch(/application\/json/);
    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer wrong-token-0123456789')
      .expect(401);
    await request(app.getHttpServer()).get('/api/v1/metrics').expect(404);
  });

  it('counts requests by route pattern and status', async () => {
    const { agent } = await signUp(app, 'metrics');
    await agent.get('/api/v1/organizations/00000000-0000-4000-8000-000000000000').expect(404);

    const response = await scrape();
    expect(response.headers['content-type']).toMatch(/^text\/plain; version=0\.0\.4/);
    const text = response.text;
    expect(text).toContain('# TYPE farmos_http_requests_total counter');
    expect(text).toMatch(
      /farmos_http_requests_total\{method="GET",route="\/api\/v1\/organizations\/:organizationId",status="404"\} \d+/,
    );
    expect(text).not.toContain('00000000-0000-4000-8000-000000000000');
    expect(text).toContain('farmos_http_request_duration_seconds_bucket');
    expect(text).toContain('farmos_process_resident_memory_bytes');
  });
});
