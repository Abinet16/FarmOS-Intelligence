import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AppRequest } from '../common/request.js';
import { requestIdOf } from '../common/request-id.middleware.js';
import type { AppMetrics } from './app-metrics.js';

/** Probes and scrapes run every few seconds; their lines would drown the rest. */
const QUIET = new Set(['/health/live', '/health/ready', '/metrics']);

/**
 * The route pattern ("/api/v1/organizations/:organizationId/farms"), never the
 * raw path, so ids don't explode metric cardinality or end up in labels.
 */
export function routeOf(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : 'unmatched';
}

/**
 * Times every request, records it in the HTTP metrics and writes one access
 * log line when the response finishes. The line carries the request id and the
 * signed-in user, never query strings or bodies, which can hold personal data.
 */
export function httpObserver(metrics: AppMetrics, logger: LoggerService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = routeOf(req);
      const status = res.statusCode;
      metrics.httpRequests.inc({ method: req.method, route, status: String(status) });
      metrics.httpDuration.observe({ method: req.method, route }, seconds);

      const fields = {
        method: req.method,
        route,
        path: req.path,
        status,
        durationMs: Math.round(seconds * 1000),
        requestId: requestIdOf(req),
        userId: (req as AppRequest).auth?.user.id,
      };
      // Fields go as a structured param, so JSON logs put them at the top level.
      if (status >= 500) logger.error('request', fields, 'Http');
      else if (QUIET.has(req.path)) logger.debug?.('request', fields, 'Http');
      else logger.log('request', fields, 'Http');
    });
    next();
  };
}
