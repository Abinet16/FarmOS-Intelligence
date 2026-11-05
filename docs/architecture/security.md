# Security model

This page lists the threats FarmOS designs against and where each control lives. It grows as
features land; items marked _planned_ name the week they arrive.

## Assets

- Farm operational records (production, mortality, health, inventory) per organization
- User identities, password hashes and sessions
- Audit history

## Threats and controls

| Threat                                                      | Control                                                                                                   | Where                                                 | Verified by                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| User of org A reads or changes org B's data by guessing IDs | Tenant guard (404 for non-members), explicit `organization_id` filters, composite FKs, row-level security | `common/guards/tenant.guard.ts`, services, migrations | `tenant-isolation.int-spec.ts`, `row-level-security.int-spec.ts`, `database-constraints.int-spec.ts` |
| A repository forgets the tenant filter                      | Runtime role sees no tenant rows without `withTenant`; RLS restricts to one organization inside it        | `tenant_rls` migration, `PrismaService`               | `row-level-security.int-spec.ts`                                                                     |
| A record in one tenant points at another tenant's parent    | Composite foreign keys `(organization_id, parent_id)`                                                     | `init` migration                                      | `database-constraints.int-spec.ts`                                                                   |
| Privilege escalation within an organization                 | Permission matrix checked per route; owner-only access management; last-owner protection with row locks   | `@RequirePermission`, `MembershipsService`            | `tenant-isolation.int-spec.ts`                                                                       |
| Credential stuffing / brute force                           | 5 sign-in attempts per minute per IP, 12-character minimum passwords, scrypt hashing                      | Better Auth config                                    | Manual check (429 on 6th attempt); automated in week 9                                               |
| Session theft via XSS                                       | `HttpOnly` session cookie, Helmet security headers                                                        | Better Auth, `app.setup.ts`                           | —                                                                                                    |
| Cross-site request forgery                                  | `SameSite=Lax` cookies; `Origin` allowlist on every cookie-carrying write                                 | `origin-check.middleware.ts`, Better Auth             | `tenant-isolation.int-spec.ts`                                                                       |
| Cross-origin data reads                                     | CORS allowlist with credentials only for listed origins                                                   | `app.setup.ts`                                        | Manual preflight check                                                                               |
| Tampering with audit history                                | No `UPDATE`/`DELETE` grant for the runtime role, plus a trigger that blocks the owner too                 | migrations                                            | `row-level-security.int-spec.ts`, `database-constraints.int-spec.ts`                                 |
| Oversized or malformed payloads                             | 100 kB JSON limit; Zod validation with unknown keys stripped                                              | `app.setup.ts`, `ZodValidationPipe`                   | `tenant-isolation.int-spec.ts`                                                                       |
| Leaking internals in errors                                 | Prisma errors mapped to 404/409, other errors to a generic 500                                            | `PrismaExceptionFilter`                               | —                                                                                                    |
| Secrets in Git                                              | `.env*` ignored; DB role passwords come from `DATABASE_URL`, never from migrations                        | `.gitignore`, `db-app-user.mjs`                       | —                                                                                                    |
| Prompt injection through farm notes                         | Tool allowlist, tenant-scoped tools, notes treated as data                                                | _planned, week 7_                                     | —                                                                                                    |
| Malicious file uploads                                      | Type/size validation, private storage, signed URLs                                                        | _planned, week 8_                                     | —                                                                                                    |

## Database roles

| Role                             | Used by                              | Can                                                                                                |
| -------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Owner (`MIGRATION_DATABASE_URL`) | Migrations, seeds, owner-level tests | Everything; bypasses RLS                                                                           |
| `farmos_app` (group, no login)   | Holds the runtime grants             | CRUD on app tables, insert/select on `audit_logs`, nothing on `_prisma_migrations`; subject to RLS |
| Runtime login (`DATABASE_URL`)   | The API                              | Inherits `farmos_app`                                                                              |

Create the runtime login role with `pnpm --filter @farmos/api db:app-user` after migrating.
