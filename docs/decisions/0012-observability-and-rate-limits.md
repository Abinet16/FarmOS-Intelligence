# ADR-0012: Observability and rate limits

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Week 9 prepares the platform for a deployed demo. Until now:

- logs were Nest's coloured terminal output, with no way to tie a line to a request;
- there were no metrics;
- the readiness check only looked at the database, so a stopped worker went unnoticed;
- only sign-in and sign-up were rate limited (by Better Auth). A signed-in user could request
  exports, reports or assistant answers as fast as they liked.

The demo runs as one API instance and one worker, so a heavy observability stack isn't
justified. Adding a dependency also costs a supply-chain review.

## Decision

**Request ids.** Every request gets an `X-Request-Id`. A well-formed id from a proxy is kept,
anything else is replaced. The id is in the response header, in the access log line and, for
a 500, in the message the web app shows.

**Structured logs with Nest's own logger.** `LOG_FORMAT=json` writes one object per line with
structured fields at the top level. Credentials (`password`, `secret`, `token`,
`authorization`, `cookie`, `apiKey`) are redacted at any depth. Access lines record the route
pattern, status, duration, request id and user id. They never include query strings or
bodies, which can hold personal data.

**Prometheus metrics without a client library.** A ~100-line registry renders counters,
histograms and gauges in the text format. It covers requests by route pattern and status,
request duration, rate-limit rejections, job enqueue results and process memory and uptime.
Route patterns, not raw paths, keep ids out of labels. `GET /metrics` is off unless
`METRICS_TOKEN` is set, and then needs it as a bearer token.

**Readiness reports degraded dependencies.** The worker writes a heartbeat to Redis every 15
seconds with a 60-second TTL. `/health/ready` reports `database`, `redis` and `worker`. Only
the database makes it fail (503). Without Redis or a worker, requests still work and
background work waits in the database (ADR-0011), so the status is `degraded` with HTTP 200.
A load balancer keeps sending traffic; a monitor can alert on `degraded`.

**Rate limits in process memory.** A global guard runs after authentication and the tenant
check, so rejected requests don't count. Each signed-in user gets `RATE_LIMIT_PER_MINUTE`
(300) requests per minute. `@RateLimit` adds tighter limits on expensive routes:

| Bucket             | Limit     | Routes                  |
| ------------------ | --------- | ----------------------- |
| `exports`          | 30 / min  | CSV exports             |
| `reports`          | 20 / min  | Report requests         |
| `assistant`        | 10 / min  | Assistant questions     |
| `alert-evaluation` | 10 / min  | Manual alert evaluation |
| `organizations`    | 20 / hour | Creating organizations  |
| `invitations`      | 60 / hour | Adding members          |

A rejection is a 429 with `Retry-After`, and it's counted in `farmos_rate_limited_total`.

**Database guard rails.** `DATABASE_STATEMENT_TIMEOUT_MS` (30 s) cancels any statement that
runs too long, and `DATABASE_POOL_MAX` (10) caps connections per process.

## Consequences

- Limits and metrics are **per process**. With N API instances a user can make up to N times
  the limit, and each instance is its own scrape target. Moving the limiter to Redis is the
  upgrade path when the API scales out. The limiter's interface doesn't need to change.
- The limiter forgets everything on restart. That's acceptable: it protects capacity, not
  billing. The assistant's daily question cap is stored in the database and survives
  restarts.
- No tracing. Request ids cover a single service today; OpenTelemetry is the step after the
  demo.
- The metrics registry is ours to maintain. It is small and covered by tests, and swapping
  in `prom-client` later would not change the metric names.
