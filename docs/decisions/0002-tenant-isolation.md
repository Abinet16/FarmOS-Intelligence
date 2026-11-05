# ADR-0002: Tenant isolation strategy

- **Status:** Accepted, implemented 2026-11-05
- **Date:** 2026-11-04

## Context

Multiple organizations share one database. A cross-tenant read or write is the most damaging
bug this product can ship. Isolation has to survive a forgotten `WHERE` clause.

## Decision

Use a shared schema with an `organization_id` column on every tenant-owned table, and add three
independent layers:

1. **Application:** the tenant comes from the authenticated membership, never from the request
   body. Repositories always filter by `organization_id`.
2. **Relational:** composite foreign keys `(organization_id, parent_id)` make it impossible
   for a row to reference another tenant's parent.
3. **Row-level security:** PostgreSQL RLS policies keyed on per-transaction settings
   (`app.current_organization_id`, `app.current_user_id`), with the API connecting as a
   non-owner role (member of `farmos_app`, no `BYPASSRLS`).

## Alternatives considered

- **Schema per tenant:** stronger separation, but migrations multiply with tenants and
  cross-tenant admin queries get awkward. Not justified at MVP scale.
- **Database per tenant:** highest isolation, highest cost and operational burden.

## Implementation

- `PrismaService.withTenant(scope, fn)` opens a transaction, calls `set_config(..., true)` for
  both settings and runs `fn`. The settings are transaction-local, so they cannot leak to the
  next request on a pooled connection.
- `PrismaService.withUser(userId, fn)` sets only the user. RLS then exposes the user's own
  memberships and organizations, which is how "my organizations" and the tenant guard work.
- Outside either helper the runtime role sees **no** tenant rows. A forgotten scope fails
  closed.
- `TenantGuard` resolves the caller's membership for any route with `:organizationId` and
  returns 404 to non-members, so organization IDs cannot be probed.
- Migrations, seeds and owner-level integrity tests use `MIGRATION_DATABASE_URL` (the owner),
  which bypasses RLS because the tables do not use `FORCE ROW LEVEL SECURITY`.

## Lesson learned

PostgreSQL combines permissive policies with `OR`. The first version let the "read your own
memberships" policy stay active inside a tenant context, so a member list for organization A
also returned the caller's memberships elsewhere. The HTTP isolation tests caught it before
release. Self-read policies now apply only when no tenant is selected
(`20261105090000_scope_self_read_policies`), and services still filter on `organization_id`
explicitly, so neither layer depends on the other being correct.

## Consequences

- Every tenant-owned query runs through `withTenant`. Code review should reject direct use of
  the Prisma client for tenant tables.
- Interactive transactions hold a connection for the length of a request's database work, so
  pool size must be sized to concurrent requests.
- Cross-tenant authorization tests are a required CI gate.
