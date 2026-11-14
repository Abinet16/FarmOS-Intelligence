import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AppMetrics } from '../../observability/app-metrics.js';
import { IS_PUBLIC } from '../decorators/public.decorator.js';
import type { AppRequest } from '../request.js';
import { RATE_LIMIT, type RateLimitRule } from './rate-limit.decorator.js';
import { FixedWindowLimiter } from './rate-limiter.js';

/**
 * Global, runs after authentication and tenant checks, so unauthenticated and
 * non-member requests are rejected before they count. Every signed-in user has
 * an API-wide budget per minute; @RateLimit adds a tighter one to a route.
 * Public routes (health, metrics) are left to their own protections.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter = new FixedWindowLimiter();

  constructor(
    private readonly reflector: Reflector,
    private readonly metrics: AppMetrics,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const who = request.auth?.user.id ?? `ip:${request.ip}`;
    const rules: RateLimitRule[] = [
      { name: 'api', limit: this.env.RATE_LIMIT_PER_MINUTE, windowSeconds: 60 },
    ];
    const route = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT, targets);
    if (route) rules.push(route);

    for (const rule of rules) {
      const result = this.limiter.hit(`${rule.name}:${who}`, rule.limit, rule.windowSeconds * 1000);
      if (!result.allowed) {
        this.metrics.rateLimited.inc({ limit: rule.name });
        context
          .switchToHttp()
          .getResponse<Response>()
          .setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new HttpException(
          `Too many requests. Try again in ${result.retryAfterSeconds} s.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}
