import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { createLogger } from './observability/logger.js';

async function bootstrap() {
  // Buffer start-up logs until the configured logger replaces the default one.
  const app = configureApp(
    await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true }),
  );
  const env = app.get<Env>(ENV);
  app.useLogger(createLogger(env));
  await app.listen(env.API_PORT);
}

void bootstrap();
