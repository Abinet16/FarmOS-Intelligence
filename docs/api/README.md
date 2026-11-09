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

## Feed types

Base: `/api/v1/organizations/:organizationId/feed-types`. Feed is always recorded in kilograms.

| Method | Path           | Permission       | Body                                 |
| ------ | -------------- | ---------------- | ------------------------------------ |
| GET    | `/`            | member           | — (sorted by name)                   |
| POST   | `/`            | `farm:configure` | `{ name }` — unique per organization |
| PATCH  | `/:feedTypeId` | `farm:configure` | `{ name }`                           |

## Daily records

Base: `/api/v1/organizations/:organizationId/flock-batches/:batchId`.

| Method | Path                              | Permission                      | Body / query                                |
| ------ | --------------------------------- | ------------------------------- | ------------------------------------------- |
| POST   | `/daily-entries`                  | `production:record`             | Daily entry (below)                         |
| GET    | `/records`                        | member                          | `from`, `to` — raw records, newest first    |
| GET    | `/daily-metrics`                  | member                          | `from`, `to` — defaults to the last 14 days |
| PATCH  | `/production-logs/:logId`         | `production:record`             | `{ eggsCollected?, waterLitres?, notes? }`  |
| POST   | `/production-logs/:logId/approve` | `production:approve-correction` | —                                           |

A daily entry saves everything in one transaction; every part is optional, but at least one
must be present:

```json
{
  "date": "2026-11-06",
  "eggsCollected": 4120,
  "waterLitres": 860.5,
  "notes": "Fan 2 serviced",
  "deaths": [{ "quantity": 3, "reasonCode": "HEAT_STRESS" }],
  "feed": [{ "feedTypeId": "…", "quantityKg": 520 }],
  "weight": { "sampleSize": 50, "averageWeightGrams": 1510 }
}
```

Rules (400 with `issues` unless noted):

- The flock must be `ACTIVE`, or `DEPLETED` with the date on or before its end date (409
  otherwise). The date must be within the flock's life and not in the future.
- Total deaths can't exceed the birds placed.
- Laying flocks must include `eggsCollected` with any production data, at most the birds alive
  that day. Broiler flocks can't record eggs.
- One production log per flock per day: a second one is a 409. Edit it with PATCH instead.
- Approved logs are locked (409) and change only through corrections (week 5).

`daily-metrics` returns `{ from, to, days: DailyMetrics[] }`, newest first, with the fields
defined in [metric definitions](../architecture/metrics.md). `null` means nothing was
recorded. The range can span at most 366 days. Flock batch responses also include `liveBirds`
and `cumulativeMortalityPct`.

## Corrections and voids

Approved production logs change only through a reviewed correction. Deaths, feed and weight
records are voided and re-entered. Base: `/api/v1/organizations/:organizationId`.

| Method | Path                                                                           | Permission                      | Body / query                                                    |
| ------ | ------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------- |
| POST   | `/flock-batches/:batchId/production-logs/:logId/corrections`                   | `production:record`             | `{ changes: { eggsCollected?, waterLitres?, notes? }, reason }` |
| GET    | `/corrections`                                                                 | `production:approve-correction` | `status`, `batchId`, paging                                     |
| POST   | `/corrections/:correctionId/approve`                                           | `production:approve-correction` | `{ note? }`                                                     |
| POST   | `/corrections/:correctionId/reject`                                            | `production:approve-correction` | `{ note }` (required)                                           |
| POST   | `/flock-batches/:batchId/{mortality,feed-usage,weight-samples}/:recordId/void` | `production:approve-correction` | `{ reason }`                                                    |

- Corrections apply only to `APPROVED` logs (409 otherwise; edit submitted logs directly).
- One pending correction per log (409). A proposal equal to the current values is a 400.
- The requester can't review their own correction (403). Approval re-validates the change
  and records before/after values in the audit log.
- A voided record stays in `/records` with `voidedAt`, `voider` and `voidReason`, but no longer
  counts towards live birds, metrics or the egg cap. Voiding twice is a 409.

## Health

Base: `/api/v1/organizations/:organizationId`. Reads need membership; writes need
`health:record`.

| Method | Path                                                          | Body / query                                                                                          |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/vaccines`                                                   | —                                                                                                     |
| POST   | `/vaccines`                                                   | `{ name, recommendedIntervalDays? }`                                                                  |
| PATCH  | `/vaccines/:vaccineId`                                        | `{ name?, recommendedIntervalDays? }`                                                                 |
| GET    | `/vaccinations`                                               | `batchId`, `status`, `dueWithinDays` (scheduled, incl. overdue), paging                               |
| POST   | `/flock-batches/:batchId/vaccinations`                        | `{ vaccineId, scheduledDate }` — planned or active flocks                                             |
| POST   | `/flock-batches/:batchId/vaccinations/:vaccinationId/outcome` | `{ status: "ADMINISTERED", administeredAt?, scheduleNext? }` or `{ status: "MISSED" \| "CANCELLED" }` |
| GET    | `/health-events`                                              | `batchId`, `resolutionStatus`, `severity`, paging                                                     |
| POST   | `/flock-batches/:batchId/health-events`                       | `{ observedAt?, category, severity, description }`                                                    |
| PATCH  | `/flock-batches/:batchId/health-events/:eventId`              | `{ resolutionStatus }`                                                                                |

- Outcomes are final (409 on a second one). Administering needs an active flock and a time
  that isn't in the future. `scheduleNext` creates the booster from the vaccine's interval and
  returns it as `next`.
- Categories describe what was observed (`RESPIRATORY`, `DIGESTIVE`, …), never a diagnosis.

## Inventory

Base: `/api/v1/organizations/:organizationId/inventory`.

| Method | Path             | Permission          | Body / query                                                          |
| ------ | ---------------- | ------------------- | --------------------------------------------------------------------- |
| GET    | `/items`         | member              | —                                                                     |
| POST   | `/items`         | `farm:configure`    | `{ name, unit, reorderLevel? }`                                       |
| PATCH  | `/items/:itemId` | `farm:configure`    | `{ name?, reorderLevel? }` (the unit is fixed)                        |
| GET    | `/stock`         | member              | `farmId`, `itemId`, `belowReorder` — balance per item and farm        |
| GET    | `/movements`     | member              | `itemId`, `farmId`, `limit`, `before` — newest first, keyset paging   |
| POST   | `/movements`     | `production:record` | `{ itemId, farmId, movementType, quantity, occurredAt?, reference? }` |
| POST   | `/transfers`     | `production:record` | `{ itemId, fromFarmId, toFarmId, quantity, occurredAt?, reference? }` |

`movementType` is `RECEIPT`, `ISSUE`, `ADJUSTMENT_IN` or `ADJUSTMENT_OUT`; transfers create
a linked `TRANSFER_OUT`/`TRANSFER_IN` pair. Quantities are positive. Outbound movements that
would take a farm below zero are a 400 that names the available balance.

## Analytics

Base: `/api/v1/organizations/:organizationId/analytics`. Every endpoint needs `reports:view`
and accepts `from`, `to` (default: the 30 days ending today in the organization's time zone,
at most 366 days) and `farmId`. Definitions:
[metric definitions](../architecture/metrics.md#windows-and-groups-of-flocks).

| Method | Path               | Returns                                                                                                                                          |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/overview`        | `flocks` (active, live birds), `production` (`totals`, `kpis`), `health`, `inventory`, `alerts` by severity (alert counts are organization-wide) |
| GET    | `/trend`           | `days`: one row per date across flocks (birds, deaths, mortality, eggs, hen-day, feed)                                                           |
| GET    | `/farms`           | `farms`: per-farm totals and KPIs, weighted by birds                                                                                             |
| GET    | `/flocks`          | `flocks`: per-flock totals, KPIs and `fcr` (broilers only)                                                                                       |
| GET    | `/flocks/:batchId` | `summary` for one flock plus its daily rows, oldest first                                                                                        |

`kpis` is `{ henDayPct, mortalityPct, feedPerBirdKg }`; any of them is `null` when nothing
was recorded to compute it from.

## Alerts

Base: `/api/v1/organizations/:organizationId`. See [alerts](../architecture/alerts.md) for the
rules and deduplication.

| Method | Path                           | Permission                      | Body / query                                                          |
| ------ | ------------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| GET    | `/alerts`                      | member                          | `open`, `status`, `severity`, `batchId`, paging                       |
| POST   | `/alerts/evaluate`             | `production:approve-correction` | `{ date? }`: defaults to yesterday; returns counts                    |
| POST   | `/alerts/:alertId/acknowledge` | `production:approve-correction` | —                                                                     |
| POST   | `/alerts/:alertId/resolve`     | `production:approve-correction` | —                                                                     |
| GET    | `/alert-settings`              | member                          | —                                                                     |
| PUT    | `/alert-settings`              | `farm:configure`                | `{ dailyMortalityPct, henDayDropPoints, feedDropPct, disabledRules }` |

Evaluating is idempotent: running it again for the same day creates nothing new. Acknowledging
an alert that isn't open, or resolving a resolved one, is a 409.

## Audit log

| Method | Path                                               | Permission   | Query                                          |
| ------ | -------------------------------------------------- | ------------ | ---------------------------------------------- |
| GET    | `/api/v1/organizations/:organizationId/audit-logs` | `audit:view` | `limit` (1–100, default 50), `before` (cursor) |

Response: `{ items: AuditLog[], nextCursor: string | null }`, newest first.

Audited actions so far: `organization.created`, `organization.updated`, `membership.created`,
`membership.role_changed`, `membership.removed`, `farm.created`, `farm.updated`, `farm.archived`,
`farm.restored`, `house.created`, `house.updated`, `house.archived`, `house.restored`,
`flock_batch.created`, `flock_batch.updated`, `flock_batch.status_changed`, `feed_type.created`,
`feed_type.renamed`, `daily_entry.recorded`, `production_log.updated`, `production_log.approved`,
`correction.requested`, `production_log.corrected`, `correction.rejected`, `mortality_event.voided`,
`feed_usage.voided`, `weight_sample.voided`, `vaccine.created`, `vaccine.updated`,
`vaccination.scheduled`, `vaccination.administered`, `vaccination.missed`,
`vaccination.cancelled`, `health_event.recorded`, `health_event.status_changed`,
`inventory_item.created`, `inventory_item.updated`, `inventory.movement_recorded`,
`inventory.transferred`, `alerts.evaluated`, `alert.acknowledged`, `alert.resolved`,
`alert_settings.updated`.
