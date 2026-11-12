# ADR-0011: Background jobs, reports and notifications

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

Week 8 adds work that doesn't fit in a request:

- reports covering up to a year of records;
- an alert evaluation for every organization, on a schedule;
- email copies of notifications, which depend on a provider that can be slow or down.

The plan already names Redis and BullMQ, and the architecture overview showed a separate
`apps/worker` package. The constraints from earlier weeks still hold:

- tenant isolation through row-level security;
- an audit trail for every change;
- no duplicated work when something is retried.

## Decision

**One codebase, two processes.** The worker is a second entry point in `apps/api`
(`src/worker.ts`), not a separate package. It boots a Nest application context with the same
modules as the API, minus HTTP. Report generation and alert evaluation then use exactly the
services and metric definitions the API uses. A separate package would have to import them
anyway, or copy them. The Docker image is shared and started with `node dist/worker.js`.

**The database is the source of truth; the queue only carries ids.**

- A report request inserts a `report_jobs` row (QUEUED) and an audit entry in one transaction.
  The job is enqueued only after that commits.
- Job payloads carry ids, never data. The processor reloads the row and acts on its current
  state.
- If Redis is down, enqueueing gives up after two seconds and the request still succeeds. A
  five-minute maintenance sweep re-enqueues QUEUED rows and PENDING emails.
- So `report_jobs.status` and `notifications.email_status` act as an outbox without a separate
  outbox table.

**Idempotent at every step.**

| Step             | What makes a repeat harmless                                                        |
| ---------------- | ----------------------------------------------------------------------------------- |
| Report request   | A client `idempotencyKey` per form submission, unique per organization              |
| Enqueue          | BullMQ job ids (`report-<id>`, `email-<id>`, `alerts-<org>-<hour>`)                 |
| Generation       | Skips jobs that are no longer QUEUED or RUNNING                                     |
| Alert evaluation | The existing dedupe keys; one notification per evaluation batch, keyed by its alert |
| Email            | Sent only while PENDING, then marked SENT                                           |
| Schedules        | `upsertJobScheduler` with fixed ids, so restarts don't add copies                   |

**Jobs run as the tenant, with current permissions.**

- Background work runs in `withOrganization`, which sets the organization for row-level
  security and no user.
- A report is generated with the requester's role at the time it runs. A member who was
  demoted or removed after asking gets a FAILED job, not the file.
- To run "for every organization", the worker reads the ids of active organizations from a
  `SECURITY DEFINER` function. It can't read the `organizations` table across tenants.
- System actions are audited with a null actor.

**Reports are CSV, stored privately for a limited time.**

- Eight report types share one definition each for direct exports (up to 92 days and 10,000
  rows) and background jobs (up to a year).
- Files are written under the organization's id by a store interface: local disk now, object
  storage at deployment. They are downloaded only through the API, by the member who requested
  them, and deleted after `REPORT_RETENTION_DAYS` (7).
- Cells that a spreadsheet would read as a formula are prefixed with `'`. This matters because
  exports include staff notes.

**Notifications are digests.** An alert evaluation sends each person who acts on alerts one
summary rather than one notification per alert. A farm with twenty flocks would otherwise get
twenty "missing records" notifications every morning. Email is opt-in per member and
organization, and alert email has a minimum severity.

## Consequences

- Running the full product locally now takes three processes: the API, the worker and the web
  app. Without the worker, reports stay "Waiting", and alerts are evaluated only when someone
  presses the button.
- Integration tests record jobs in memory and run them explicitly through the same processor
  the worker uses. One suite uses a real Redis to cover deduplication, delivery and Redis
  being unreachable.
- Local disk only works with a single host, or with a volume shared by the API and the worker
  (as in `docker-compose.yml`). Week 10 swaps in object storage behind the same interface.
- Email has no real provider yet: `MAIL_TRANSPORT=log` writes messages to the worker log.
- The maintenance sweep runs every five minutes for every organization. That is fine at
  portfolio scale; a large deployment would page through organizations or keep a global index
  of pending work.

## Alternatives considered

- **A separate `apps/worker` package** (as first sketched): rejected, because it would need the
  API's modules either way, and two build pipelines for one set of business rules buys nothing.
- **A transactional outbox table** written in the same transaction as each event: equivalent
  here. The status columns already are the outbox, and a generic table would add a relay
  process.
- **Postgres-backed jobs** (pg-boss, or BullMQ's Postgres backend): one less service. But the
  plan and the stack already include Redis, and BullMQ's schedulers, retries and
  deduplication are well proven.
- **Generating reports in the request:** fine for a week of data (that is the direct export),
  but a year of daily rows across many flocks can take long enough to time out a request.
