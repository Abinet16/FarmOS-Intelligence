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

## Paged lists

Farm, house and flock batch lists accept `page` (default 1) and `pageSize` (1–100, default 20)
and return `{ items, total, page, pageSize }`. Dates such as `placementDate` are calendar dates,
sent as `YYYY-MM-DD` and returned at UTC midnight (`2026-10-01T00:00:00.000Z`).

## Farms

Base: `/api/v1/organizations/:organizationId/farms`. Reads need membership; writes need
`farm:configure`.

| Method | Path               | Body / query                                                        |
| ------ | ------------------ | ------------------------------------------------------------------- |
| GET    | `/`                | `q` (name or location), `includeArchived`, paging                   |
| POST   | `/`                | `{ name, location? }` — names are unique per organization           |
| GET    | `/:farmId`         | — includes `houseCount` (open houses)                               |
| PATCH  | `/:farmId`         | `{ name?, location? }` (`location: null` clears it)                 |
| POST   | `/:farmId/archive` | — archives its open houses too; 409 while a flock is planned/active |
| POST   | `/:farmId/restore` | — restores the houses archived with it                              |

## Houses

Base: `/api/v1/organizations/:organizationId/houses`.

| Method | Path                | Body / query                                                        |
| ------ | ------------------- | ------------------------------------------------------------------- |
| GET    | `/`                 | `farmId`, `q` (name), `includeArchived`, paging                     |
| POST   | `/`                 | `{ farmId, name, capacity }` — 409 if the farm is archived          |
| GET    | `/:houseId`         | — includes `farm` and `activeBatch`                                 |
| PATCH  | `/:houseId`         | `{ name?, capacity? }` — capacity can't drop below the active flock |
| POST   | `/:houseId/archive` | — 409 while a flock is planned or active                            |
| POST   | `/:houseId/restore` | — 409 while its farm is archived                                    |

## Flock batches

Base: `/api/v1/organizations/:organizationId/flock-batches`.

| Method | Path               | Body / query                                                                                    |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| GET    | `/`                | `status`, `purpose`, `farmId`, `houseId`, `q` (code or breed), paging; newest placement first   |
| POST   | `/`                | `{ houseId, batchCode, breed, purpose?, placementDate, initialBirds, notes? }` — starts PLANNED |
| GET    | `/:batchId`        | — includes `house.farm` and `ageDays` (null while planned)                                      |
| PATCH  | `/:batchId`        | Any create field; `houseId`, `placementDate`, `initialBirds` only while PLANNED                 |
| POST   | `/:batchId/status` | `{ status, date? }` — see the lifecycle below                                                   |

Lifecycle: `PLANNED → ACTIVE → DEPLETED → CLOSED`, or `PLANNED → CLOSED` to cancel.

- `ACTIVE` (place birds): the house must be open, hold `initialBirds`, and have no other active
  flock; the placement date can't be in the future.
- `DEPLETED`: `date` defaults to today in the organization's time zone; it can't be in the future
  or before placement.
- `CLOSED`: a closed batch is read-only.

Invalid transitions and rule conflicts return 409. Field-level problems (too many birds for
the house, a bad depletion date) return 400 with `issues`.

## Audit log

| Method | Path                                               | Permission   | Query                                          |
| ------ | -------------------------------------------------- | ------------ | ---------------------------------------------- |
| GET    | `/api/v1/organizations/:organizationId/audit-logs` | `audit:view` | `limit` (1–100, default 50), `before` (cursor) |

Response: `{ items: AuditLog[], nextCursor: string | null }`, newest first.

Audited actions so far: `organization.created`, `organization.updated`, `membership.created`,
`membership.role_changed`, `membership.removed`, `farm.created`, `farm.updated`, `farm.archived`,
`farm.restored`, `house.created`, `house.updated`, `house.archived`, `house.restored`,
`flock_batch.created`, `flock_batch.updated`, `flock_batch.status_changed`.
