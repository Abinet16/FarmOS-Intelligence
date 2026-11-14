import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { createLogger } from './observability/logger.js';
import { WorkerModule } from './worker/worker.module.js';

/** Entry point of the background worker: `node dist/worker.js`. */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(createLogger(app.get<Env>(ENV)));
  app.enableShutdownHooks();
}

void bootstrap();
