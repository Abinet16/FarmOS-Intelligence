# ADR-0005: Authentication with Better Auth

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The MVP needs email/password sign-up, sign-in, sign-out and session revocation. The public demo
and CI must work without third-party accounts, and identity data should live in our own
PostgreSQL so it can be backed up and restored with everything else.

## Decision

Use [Better Auth](https://www.better-auth.com) inside the API process, with its Prisma adapter
writing to `users`, `sessions`, `accounts` and `verifications`.

- **Sessions:** opaque, server-side sessions in an `HttpOnly`, `SameSite=Lax` cookie (`Secure`
  in production). Seven-day lifetime, refreshed daily. Signing out deletes the session row, so
  revocation is immediate. JWT access tokens were rejected because they cannot be revoked
  before they expire.
- **Passwords:** 12–128 characters, hashed by Better Auth (scrypt).
- **Brute force:** sign-in and sign-up are limited to 5 requests per minute per IP; other auth
  endpoints to 100. Storage is in memory for now and moves to Redis when the API runs more than
  one instance.
- **CSRF:** Better Auth checks the `Origin` of its own endpoints against the CORS allowlist. A
  middleware applies the same rule to every state-changing FarmOS request that carries cookies.
- **IDs:** Better Auth is configured to generate UUIDs so its rows fit the existing schema.

Better Auth's organization plugin is **not** used. Tenancy is a core domain concern here (composite
foreign keys, RLS, permission matrix) and stays in our own `organizations` and `memberships`.

## Alternatives considered

- **External OIDC provider (Auth0, Clerk, Keycloak):** stronger out-of-the-box features (MFA,
  SSO), but adds a paid or self-hosted dependency to every environment, including CI.
- **Hand-written auth:** full control, but password storage, session rotation and rate limiting
  are easy to get subtly wrong.

## Consequences

- Adding OAuth providers, MFA or email verification later is a configuration change.
- Auth tables are not tenant-scoped and have no RLS; they are only reached through Better Auth
  and the `/me` endpoint.
