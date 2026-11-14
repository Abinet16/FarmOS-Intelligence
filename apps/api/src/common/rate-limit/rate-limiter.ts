export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Whole seconds until the window resets; for the Retry-After header. */
  retryAfterSeconds: number;
}

/** Above this many tracked keys, expired windows are swept on the next hit. */
const SWEEP_THRESHOLD = 10_000;

/**
 * Fixed-window counters in process memory. Cheap and dependency-free; the
 * trade-off is that each API instance counts on its own, so N instances allow
 * up to N times the limit. That's acceptable for abuse protection here (see
 * ADR-0012); a shared store (Redis) is the upgrade path.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetsAt: number }>();

  hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    if (this.windows.size > SWEEP_THRESHOLD) this.sweep(now);

    let window = this.windows.get(key);
    if (!window || window.resetsAt <= now) {
      window = { count: 0, resetsAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= limit,
      remaining: Math.max(0, limit - window.count),
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetsAt - now) / 1000)),
    };
  }

  /** Tracked keys; for tests and the sweep. */
  get size(): number {
    return this.windows.size;
  }

  private sweep(now: number) {
    for (const [key, window] of this.windows) {
      if (window.resetsAt <= now) this.windows.delete(key);
    }
  }
}
