# ADR-0003: PostgreSQL with Prisma 7

- **Status:** Accepted
- **Date:** 2026-11-04

## Decision

Use PostgreSQL 17 as the system of record and Prisma 7 (with the `pg` driver adapter) for
type-safe queries and migrations.

## Consequences

- Migrations are SQL files that get reviewed and committed. Constraints Prisma cannot model
  (CHECK constraints, triggers, RLS policies) are added by hand to the migration SQL.
- CI applies all migrations to an empty database and fails if `schema.prisma` and the
  migrations have drifted apart.
- Analytics queries that need window functions use `$queryRaw` with tagged templates
  (parameterized), wrapped in a module-owned repository.
