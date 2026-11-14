import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT = 'farmos:rateLimit';

export interface RateLimitRule {
  /** Names the bucket in metrics and keeps routes that share it counting together. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * A tighter limit for an expensive route, counted per user (or per client
 * address before sign-in). It applies on top of the API-wide per-user limit.
 */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);
