import { Counter, Gauge, Histogram, MetricsRegistry } from './metrics.js';

/** Seconds; spans fast reads up to the slow end of report exports. */
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** The metrics one API process exposes on GET /metrics. */
export class AppMetrics {
  readonly registry = new MetricsRegistry();

  readonly httpRequests = this.registry.register(
    new Counter('farmos_http_requests_total', 'HTTP requests by method, route and status.'),
  );

  readonly httpDuration = this.registry.register(
    new Histogram(
      'farmos_http_request_duration_seconds',
      'HTTP request duration by method and route.',
      DURATION_BUCKETS,
    ),
  );

  readonly rateLimited = this.registry.register(
    new Counter('farmos_rate_limited_total', 'Requests rejected with 429, by limit.'),
  );

  readonly jobsEnqueued = this.registry.register(
    new Counter('farmos_jobs_enqueued_total', 'Job enqueue attempts by job and result.'),
  );

  constructor() {
    const started = Date.now();
    this.registry.register(
      new Gauge('farmos_process_uptime_seconds', 'Seconds since the process started.', () =>
        Math.round((Date.now() - started) / 1000),
      ),
    );
    this.registry.register(
      new Gauge(
        'farmos_process_resident_memory_bytes',
        'Resident memory of the process.',
        () => process.memoryUsage().rss,
      ),
    );
    this.registry.register(
      new Gauge(
        'farmos_process_heap_used_bytes',
        'V8 heap in use.',
        () => process.memoryUsage().heapUsed,
      ),
    );
  }
}
