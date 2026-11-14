import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ENV } from '../src/config/config.module.js';
import { loadEnv } from '../src/config/env.js';
import { createTestApp } from './support/app.js';
import { WEB_ORIGIN } from './support/test-env.js';

/**
 * Better Auth's sign-in limit (5 per minute per client address), which the
 * other suites switch off. Development mode turns it on without secure cookies.
 */
describe('sign-in rate limit', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp([
      { provide: ENV, useValue: { ...loadEnv(), NODE_ENV: 'development' } },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const signIn = (forwardedFor?: string) => {
    const req = request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', WEB_ORIGIN);
    if (forwardedFor) req.set('X-Forwarded-For', forwardedFor);
    return req.send({ email: 'nobody@example.test', password: 'wrong-password-123' });
  };

  it('rejects the sixth attempt in a minute from one address', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await signIn()).status).not.toBe(429);
    }
    expect((await signIn()).status).toBe(429);
  });

  it("can't be dodged with a spoofed forwarding header", async () => {
    // TRUST_PROXY is off, so X-Forwarded-For is ignored and the socket address counts.
    expect((await signIn('203.0.113.99')).status).toBe(429);
  });
});
