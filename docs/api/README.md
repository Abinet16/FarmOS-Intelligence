# API reference

Base URL: `http://localhost:4000`. Versioned endpoints live under `/api/v1`. Authentication uses
the session cookie set by the `/api/auth/*` endpoints. Browsers send it automatically when
requests use `credentials: 'include'`.

State-changing requests that carry cookies must send an `Origin` header from the CORS allowlist.

OpenAPI documentation is planned for week 10. Until then, this page is the reference.

## Errors

| Status | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| 400    | Validation failed. Body: `{ message, issues: [{ path, message }] }`               |
| 401    | No valid session                                                                  |
| 403    | Member of the organization, but the role lacks a required permission              |
| 404    | Not found, **or** not a member of the organization (indistinguishable on purpose) |
| 409    | Unique conflict, or a rule such as "keep at least one owner"                      |
| 429    | Rate limited (auth endpoints)                                                     |

## Health (public)

| Method | Path            | Description           |
| ------ | --------------- | --------------------- |
| GET    | `/health/live`  | Process is up         |
| GET    | `/health/ready` | Database is reachable |

## Authentication (Better Auth)

| Method | Path                      | Body                                                |
| ------ | ------------------------- | --------------------------------------------------- |
| POST   | `/api/auth/sign-up/email` | `{ name, email, password }` (password 12–128 chars) |
| POST   | `/api/auth/sign-in/email` | `{ email, password }`                               |
| POST   | `/api/auth/sign-out`      | —                                                   |
| GET    | `/api/auth/get-session`   | —                                                   |

## Current user

| Method | Path         | Permission | Description                                      |
| ------ | ------------ | ---------- | ------------------------------------------------ |
| GET    | `/api/v1/me` | signed in  | User, plus role and permissions per organization |

## Organizations

| Method | Path                                    | Permission            | Body                                                |
| ------ | --------------------------------------- | --------------------- | --------------------------------------------------- |
| POST   | `/api/v1/organizations`                 | signed in             | `{ name, slug?, timezone? }` — caller becomes OWNER |
| GET    | `/api/v1/organizations`                 | signed in             | Organizations the caller belongs to, with role      |
| GET    | `/api/v1/organizations/:organizationId` | member                | —                                                   |
| PATCH  | `/api/v1/organizations/:organizationId` | `organization:manage` | `{ name?, timezone? }`                              |

## Members

| Method | Path                                                          | Permission      | Body                                        |
| ------ | ------------------------------------------------------------- | --------------- | ------------------------------------------- |
| GET    | `/api/v1/organizations/:organizationId/members`               | member          | —                                           |
| POST   | `/api/v1/organizations/:organizationId/members`               | `access:manage` | `{ email, role }` (user must be registered) |
| PATCH  | `/api/v1/organizations/:organizationId/members/:membershipId` | `access:manage` | `{ role }`                                  |
| DELETE | `/api/v1/organizations/:organizationId/members/:membershipId` | `access:manage` | —                                           |

## Audit log

| Method | Path                                               | Permission   | Query                                          |
| ------ | -------------------------------------------------- | ------------ | ---------------------------------------------- |
| GET    | `/api/v1/organizations/:organizationId/audit-logs` | `audit:view` | `limit` (1–100, default 50), `before` (cursor) |

Response: `{ items: AuditLog[], nextCursor: string | null }`, newest first.

Audited actions so far: `organization.created`, `organization.updated`, `membership.created`,
`membership.role_changed`, `membership.removed`.
