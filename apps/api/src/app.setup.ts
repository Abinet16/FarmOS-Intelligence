import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import helmet from 'helmet';
import { clientIp } from './common/client-ip.middleware.js';
import { originCheck } from './common/origin-check.middleware.js';
import { requestId, REQUEST_ID_HEADER } from './common/request-id.middleware.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { AUTH } from './modules/auth/auth.module.js';
import type { Auth } from './modules/auth/auth.js';

/**
 * Shared by main.ts and the HTTP tests so both exercise the same middleware
 * order. Create the app with { bodyParser: false }: Better Auth must read the
 * raw request body, so its handler is mounted before the JSON parser.
 */
export function configureApp(app: INestApplication): INestApplication {
  const env = app.get<Env>(ENV);
  const auth = app.get<Auth>(AUTH);
  const server = (app as NestExpressApplication).getHttpAdapter().getInstance();

  server.set('trust proxy', env.TRUST_PROXY);
  // First, so every later middleware, log line and error can refer to the id.
  app.use(requestId);
  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    // The web app reads report file names from downloads made with fetch, and
    // shows the request id with server errors.
    exposedHeaders: ['Content-Disposition', REQUEST_ID_HEADER],
  });
  app.use(originCheck(env.CORS_ORIGINS));
  server.all('/api/auth/{*path}', clientIp, toNodeHandler(auth));
  app.use(express.json({ limit: '100kb' }));
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.enableShutdownHooks();
  return app;
}
