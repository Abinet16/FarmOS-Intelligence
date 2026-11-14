import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AppMetrics } from './app-metrics.js';

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Prometheus scrape endpoint. Off unless METRICS_TOKEN is set, and then it
 * needs `Authorization: Bearer <token>`: route names and volumes are internal.
 */
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: AppMetrics,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  scrape(@Headers('authorization') authorization?: string) {
    const token = this.env.METRICS_TOKEN;
    if (!token) throw new NotFoundException();
    const given = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!given || !sameToken(given, token)) throw new UnauthorizedException();
    return this.metrics.registry.render();
  }
}
