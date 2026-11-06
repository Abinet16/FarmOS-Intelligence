# ADR-0006: Farm structure — archiving, flock lifecycle and list paging

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Farms, houses and flock batches are the parents of every operational record (production,
mortality, feed, health). Week 3 had to decide how they are removed, how a flock moves through
its life, and how lists are paged.

## Decision

**Archive, never delete.** Farms and houses get an `archived_at` timestamp instead of a delete
endpoint; every foreign key is `ON DELETE RESTRICT`, so history can't vanish with its parent.
Archived rows are hidden from lists unless `includeArchived=true`, and can't receive new houses
or flocks. Archiving a farm archives its open houses with the **same timestamp**, so restoring
the farm brings back exactly those houses and not ones archived earlier on purpose. A farm or
house with a planned or active flock can't be archived.

**An explicit, forward-only flock lifecycle.**
`PLANNED → ACTIVE → DEPLETED → CLOSED`, plus `PLANNED → CLOSED` for a flock that never arrived.
The transition table lives in `@farmos/shared-types`, so the API enforces it and the web app
offers only valid actions. Status changes go through `POST …/flock-batches/:id/status`, not a
generic PATCH, so each one is a single audited event with its own rules:

- Placing birds (`ACTIVE`) needs an open house with room, no other active flock in it, and a
  placement date that isn't in the future.
- Depletion takes a date (default: today **in the organization's time zone**) that can't be in
  the future or before placement.
- House, placement date and bird count can only change while `PLANNED`. Afterwards, operational
  records depend on them, so mistakes are fixed with corrections (week 5), not edits.
- `CLOSED` batches are read-only.

The database backs the rules that matter most: a partial unique index allows **one active flock
per house**, and CHECK constraints tie `end_date` to the ended statuses and keep it on or after
placement.

**Concurrency.** Archiving locks the farm or house row `FOR UPDATE`; placing or planning a
flock share-locks the house and farm rows. An archive and a placement in the same house
therefore serialize instead of both passing their checks.

**Offset paging for configuration lists.** Farm, house and batch lists return
`{ items, total, page, pageSize }`. They stay small per tenant and tables need a total. The audit
log and, later, daily records use keyset paging, because they grow without bound.

## Consequences

- Nothing in the farm structure can be hard-deleted through the API. Test data is removed
  by archiving.
- A wrongly placed flock can only be ended and replaced, not rewound. This is deliberate: once
  records exist, rewinding would orphan them.
- `prisma migrate dev` can't build its shadow database, because the RLS migration revokes
  access to `_prisma_migrations`. New migrations are generated with
  `pnpm db:migration:new <name>`, which diffs the live database against the schema.
