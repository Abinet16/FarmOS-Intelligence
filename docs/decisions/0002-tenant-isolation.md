# ADR-0002: Tenant isolation strategy

- **Status:** Accepted (RLS layer scheduled for week 2)
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
3. **Row-level security (week 2):** PostgreSQL RLS policies keyed on a per-transaction
   setting (`app.current_organization_id`), with the API connecting as a non-owner role.

## Alternatives considered

- **Schema per tenant:** stronger separation, but migrations multiply with tenants and
  cross-tenant admin queries get awkward. Not justified at MVP scale.
- **Database per tenant:** highest isolation, highest cost and operational burden.

## Consequences

- Every tenant-owned query must run inside a transaction that sets the tenant context once RLS
  is enabled. A Prisma client extension will wrap this.
- Cross-tenant authorization tests are a required CI gate.
