import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { AppMetrics } from './app-metrics.js';
import { MetricsController } from './metrics.controller.js';

describe('MetricsController', () => {
  const controller = (token?: string) =>
    new MetricsController(new AppMetrics(), { METRICS_TOKEN: token } as Env);

  it('is off without a configured token', () => {
    expect(() => controller().scrape('Bearer anything-at-all')).toThrow(NotFoundException);
  });

  it('rejects a missing, malformed or wrong token', () => {
    const metrics = controller('a-very-long-metrics-token');
    expect(() => metrics.scrape()).toThrow(UnauthorizedException);
    expect(() => metrics.scrape('a-very-long-metrics-token')).toThrow(UnauthorizedException);
    expect(() => metrics.scrape('Bearer a-very-long-metrics-tokeX')).toThrow(UnauthorizedException);
    expect(() => metrics.scrape('Bearer short')).toThrow(UnauthorizedException);
  });

  it('renders the registry for the right token', () => {
    expect(
      controller('a-very-long-metrics-token').scrape('Bearer a-very-long-metrics-token'),
    ).toContain('farmos_process_uptime_seconds');
  });
});
