import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { WEB_ORIGIN } from './test-env.js';

/** Optionally replaces providers, e.g. the assistant's model with a scripted one. */
export async function createTestApp(
  overrides: { provide: unknown; useValue: unknown }[] = [],
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  for (const { provide, useValue } of overrides) {
    builder.overrideProvider(provide as string).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ bodyParser: false, logger: false }));
  await app.init();
  return app;
}

let counter = 0;

/** Signs up a fresh user and returns a cookie-carrying agent for them. */
export async function signUp(app: INestApplication, label: string) {
  const agent = request.agent(app.getHttpServer());
  const email = `${label}-${Date.now()}-${counter++}@example.test`;
  const response = await agent
    .post('/api/auth/sign-up/email')
    .set('Origin', WEB_ORIGIN)
    .send({ name: label, email, password: 'correct-horse-battery-staple' })
    .expect(200);
  return { agent, email, userId: response.body.user.id as string };
}
