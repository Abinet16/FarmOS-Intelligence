import { EventEmitter } from 'node:events';
import type { LoggerService } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppMetrics } from './app-metrics.js';
import { httpObserver, routeOf } from './http-observer.js';

describe('httpObserver', () => {
  const logger = () =>
    ({ log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) satisfies LoggerService;

  const run = (
    req: Partial<Request> & { auth?: unknown },
    status: number,
    log = logger(),
    metrics = new AppMetrics(),
  ) => {
    const res = Object.assign(new EventEmitter(), { statusCode: status }) as unknown as Response;
    const next = vi.fn();
    httpObserver(metrics, log)(
      {
        method: 'GET',
        baseUrl: '',
        headers: { 'x-request-id': 'req-12345678' },
        ...req,
      } as Request,
      res,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    res.emit('finish');
    return { log, metrics };
  };

  const farmsRoute = { route: { path: '/api/v1/organizations/:organizationId/farms' } };

  it('labels metrics with the route pattern, not the raw path', () => {
    const { metrics } = run({ ...farmsRoute, path: '/api/v1/organizations/abc/farms' }, 200);
    expect(
      metrics.httpRequests.value({
        method: 'GET',
        route: '/api/v1/organizations/:organizationId/farms',
        status: '200',
      }),
    ).toBe(1);
    expect(metrics.registry.render()).not.toContain('/organizations/abc');
  });

  it('groups requests that matched no route', () => {
    expect(routeOf({ baseUrl: '' } as Request)).toBe('unmatched');
  });

  it('logs the request id and user, but not the query string', () => {
    const { log } = run(
      { ...farmsRoute, path: '/api/v1/organizations/abc/farms', auth: { user: { id: 'u1' } } },
      200,
    );
    const entry = log.log.mock.calls[0]![0];
    expect(entry).toMatchObject({ status: 200, requestId: 'req-12345678', userId: 'u1' });
    expect(JSON.stringify(entry)).not.toContain('?');
  });

  it('logs server errors at error level and probes at debug level', () => {
    expect(run({ path: '/boom' }, 500).log.error).toHaveBeenCalledOnce();
    const probe = run({ path: '/health/ready' }, 200).log;
    expect(probe.debug).toHaveBeenCalledOnce();
    expect(probe.log).not.toHaveBeenCalled();
  });
});
