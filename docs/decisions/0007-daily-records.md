# ADR-0007: Daily flock records

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Field teams record eggs, water, deaths, feed and weight samples for each flock every day, often
on a phone and sometimes in several sittings (a mortality count at noon, the egg count at
dusk). The numbers feed every metric, alert and AI answer later in the roadmap, so bad input
must be stopped when it is saved, not discovered in a dashboard.

## Decision

**One write endpoint per day, not one per table.**
`POST …/flock-batches/:batchId/daily-entries` accepts any combination of production (eggs,
water, notes), deaths, feed lines and a weight sample. It saves them in **one transaction**
with **one audit event**. Every part is optional, so partial entries work. The tables stay
separate (`production_logs`, `mortality_events`, `feed_usage`, `weight_samples`), so each keeps
its own constraints and indexes.

**Validation that needs the flock's state happens under a row lock on the batch:**

- Records are accepted only while the flock is `ACTIVE`, or `DEPLETED` for late entries up to
  its end date. Dates must fall within the flock's life and not in the future, using the
  organization's time zone.
- Total deaths can never exceed the birds placed. Concurrent entries serialize on the lock, so
  two people can't each record the last 50 birds.
- Eggs can't exceed the birds alive at the start of the day, and broiler flocks record none.
  A production log for a laying flock must include an egg count, because a log without one
  would read as "0 eggs" rather than "not recorded".
- One production log per flock per day (also a unique constraint); a second one is a 409
  pointing to the edit endpoint.

**Approval.** Production logs start `SUBMITTED` and can be edited by anyone with
`production:record`. A user with `production:approve-correction` approves them; approved logs
are locked, and changes go through corrections (week 5). Mortality, feed and weight records are
append-only for now; week 5 adds the correction path for them.

**Fixed vocabularies.** Mortality causes are a Postgres enum, so reports can group by them.
Feed is always recorded in kilograms, because the metric definitions depend on it; the
per-feed-type `unit` column was dropped.

**Metrics are pure functions.** `modules/metrics/flock-metrics.ts` implements
[the metric definitions](../architecture/metrics.md) from per-day inputs, with unit tests
against a hand-calculated fixture. The API loads the inputs with a few grouped queries, and the
integration tests check the same fixture end to end. Missing data stays `null`.

## Consequences

- The web form maps one-to-one onto the endpoint, and an interrupted save never leaves half a
  day recorded.
- A mistaken death count can't be fixed until week 5's corrections. That is acceptable for one
  week and keeps "no silent edits" true from the start.
- The batch row lock serializes writes per flock. Contention is negligible: one flock gets a
  handful of entries per day.
