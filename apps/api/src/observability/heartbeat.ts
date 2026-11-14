import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { errorText } from '../jobs/jobs.js';

/** How often the worker reports in, and how long a report counts as recent. */
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TTL_S = 60;

export const heartbeatKey = (prefix: string) => `${prefix}:worker:heartbeat`;

export type Probe = 'up' | 'down';

/**
 * A small Redis connection for liveness signals: the worker writes a heartbeat
 * with a TTL, and the API's readiness check pings Redis and reads it. It fails
 * fast and never queues commands, so a Redis outage can't stall a health check.
 */
@Injectable()
export class Heartbeat implements OnModuleDestroy {
  private readonly logger = new Logger('Heartbeat');
  private readonly redis: Redis;
  private readonly key: string;
  private timer?: NodeJS.Timeout;
  private connecting?: Promise<void>;

  constructor(@Inject(ENV) env: Env) {
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
    });
    this.redis.on('error', () => undefined); // reported through probe results instead
    this.key = heartbeatKey(env.QUEUE_PREFIX);
  }

  /** Worker side: report in now and every interval until shutdown. */
  start(worker: string) {
    const beat = () =>
      this.connected()
        .then(() => this.redis.set(this.key, `${worker}@${Date.now()}`, 'EX', HEARTBEAT_TTL_S))
        .catch((error) => this.logger.warn(`Heartbeat failed: ${errorText(error)}`));
    void beat();
    this.timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  /** API side: whether Redis answers. */
  async redisStatus(): Promise<Probe> {
    try {
      await this.connected();
      return (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  /** API side: whether some worker reported in within the TTL. */
  async workerStatus(): Promise<Probe> {
    try {
      await this.connected();
      return (await this.redis.get(this.key)) ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    this.redis.disconnect();
  }

  /** Connects on first use; concurrent callers share one attempt. */
  private connected(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      this.connecting = this.redis.connect().finally(() => (this.connecting = undefined));
    }
    return this.connecting ?? Promise.resolve();
  }
}
