# Observability and operations

How to see what the API and worker are doing, and what to check when something goes wrong.
The decisions behind this are in [ADR-0012](../decisions/0012-observability-and-rate-limits.md).

## Health checks

| Endpoint            | Use for         | Answers                                                                      |
| ------------------- | --------------- | ---------------------------------------------------------------------------- |
| `GET /health/live`  | Liveness probe  | `{"status":"ok"}` while the process runs. Touches nothing else.              |
| `GET /health/ready` | Readiness probe | `database`, `redis` and `worker` checks; 503 only when the database is down. |

```json
{ "status": "degraded", "checks": { "database": "up", "redis": "up", "worker": "down" } }
```

`degraded` means requests work but background work is waiting. Reports stay "Waiting",
scheduled alert checks and emails don't run. The work is safe in the database and catches up
once the worker is back.

The worker counts as `up` if it wrote its heartbeat (`<QUEUE_PREFIX>:worker:heartbeat` in
Redis) in the last 60 seconds. It writes one every 15 seconds.

## Request ids

Every response has an `X-Request-Id` header. Send your own (8–128 characters of letters,
digits, `.`, `:`, `_` or `-`) and it's kept, so a proxy's id follows the request. When the API
fails with a 500, the web app shows the first 8 characters as a reference. Search the logs
for it.

## Logs

Set `LOG_FORMAT=json` in production (Docker Compose already does). Each line is one JSON
object:

```json
{
  "level": "log",
  "pid": 1,
  "timestamp": 1794681533758,
  "message": "request",
  "context": "Http",
  "method": "GET",
  "route": "/api/v1/organizations/:organizationId/farms",
  "path": "/api/v1/organizations/…/farms",
  "status": 200,
  "durationMs": 12,
  "requestId": "…",
  "userId": "…"
}
```

- 5xx responses log at `error` level; health checks and metric scrapes at `debug`.
- `LOG_LEVEL` sets the least severe level written (`debug`, `log`, `warn`, `error`).
- Query strings and bodies are never logged. Fields named like credentials are redacted.
- The worker logs each job (`report.generate 1234 done in 812 ms`) and every failed attempt.

## Metrics

Set `METRICS_TOKEN` (16+ characters) to turn on `GET /metrics`, then scrape it with
`Authorization: Bearer <token>`. Without the token the endpoint answers 404.

| Metric                                 | Type      | Labels                      |
| -------------------------------------- | --------- | --------------------------- |
| `farmos_http_requests_total`           | counter   | `method`, `route`, `status` |
| `farmos_http_request_duration_seconds` | histogram | `method`, `route`           |
| `farmos_rate_limited_total`            | counter   | `limit`                     |
| `farmos_jobs_enqueued_total`           | counter   | `job`, `result`             |
| `farmos_process_uptime_seconds`        | gauge     |                             |
| `farmos_process_resident_memory_bytes` | gauge     |                             |
| `farmos_process_heap_used_bytes`       | gauge     |                             |

Useful alerts:

- 5xx rate: `sum(rate(farmos_http_requests_total{status=~"5.."}[5m]))` above zero for 5 minutes.
- Slow requests: p95 of `farmos_http_request_duration_seconds` above 1 s.
- Queue trouble: `farmos_jobs_enqueued_total{result="failed"}` increasing (Redis unreachable).
- Readiness `degraded` for more than 5 minutes (worker down).

## Rate limits

Every signed-in user has `RATE_LIMIT_PER_MINUTE` (300) requests per minute, plus tighter
limits on exports, reports, the assistant, alert evaluation, creating organizations and adding
members. A rejected request gets 429 and a `Retry-After` header. Limits are counted per API
instance. Sign-in and sign-up have their own limits in Better Auth (5 per minute per address).

## Runbook

| Symptom                                                  | Check                                                               | Fix                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Reports stuck on "Waiting"                               | `/health/ready` shows `worker: down`                                | Start the worker (`node dist/worker.js`). Queued work resumes; the 5-minute sweep re-adds lost jobs. |
| `redis: down`                                            | `redis-cli -u $REDIS_URL ping`                                      | Restore Redis. Requests keep working meanwhile; enqueues give up after 2 s.                          |
| Readiness 503                                            | `database: down`; API logs                                          | Restore Postgres. Check `DATABASE_URL` and the runtime role (`db:app-user`).                         |
| User reports "Something went wrong (reference abcd1234)" | Search the logs for `abcd1234`                                      | The matching `Http` error line has the route and user; the stack trace is just before it.            |
| Users see 429s                                           | `farmos_rate_limited_total` by `limit`                              | Raise `RATE_LIMIT_PER_MINUTE`, or the route's `@RateLimit` if a real workflow needs more.            |
| "canceling statement due to statement timeout"           | The route in the error log                                          | Find the slow query; raise `DATABASE_STATEMENT_TIMEOUT_MS` only as a stopgap.                        |
| Too many database connections                            | API instances × `DATABASE_POOL_MAX` + workers × `DATABASE_POOL_MAX` | Lower `DATABASE_POOL_MAX` or raise Postgres `max_connections`.                                       |
