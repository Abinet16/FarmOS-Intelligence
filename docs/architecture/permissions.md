# Permission matrix

Roles are assigned per **membership**, so the same person can hold different roles in
different organizations. Code checks **permissions**, never role names. The matrix is defined
once in [`packages/shared-types/src/roles.ts`](../../packages/shared-types/src/roles.ts).

| Permission                      | Owner | Manager | Supervisor | Field worker | Veterinarian | Auditor |
| ------------------------------- | :---: | :-----: | :--------: | :----------: | :----------: | :-----: |
| `organization:manage`           |  ✅   |         |            |              |              |         |
| `access:manage`                 |  ✅   |         |            |              |              |         |
| `farm:configure`                |  ✅   |   ✅    |            |              |              |         |
| `production:record`             |  ✅   |   ✅    |     ✅     |      ✅      |              |         |
| `production:approve-correction` |  ✅   |   ✅    |     ✅     |              |              |         |
| `health:record`                 |  ✅   |   ✅    |     ✅     |              |      ✅      |         |
| `reports:view`                  |  ✅   |   ✅    |     ✅     |              |      ✅      |   ✅    |
| `reports:view-limited`          |       |         |            |      ✅      |              |         |
| `audit:view`                    |  ✅   |   ✅    |            |              |              |   ✅    |
| `ai:query`                      |  ✅   |   ✅    |     ✅     |              |      ✅      |         |

## Enforcement

1. `AuthGuard` (global) rejects requests without a valid session with **401**.
2. `TenantGuard` (global) runs on every route with an `:organizationId` parameter. It loads the
   caller's membership. No membership gives **404**, the same response as a missing
   organization, so IDs cannot be probed.
3. `@RequirePermission(...)` lists the permissions a route needs. Missing ones give **403**.
   Using the decorator on a route without `:organizationId` is a server error, so a permission
   check can never be skipped silently.
4. Inside the request, data access runs through `withTenant`, so row-level security limits the
   database to the same organization.

## Rules

- Every permission is evaluated **inside one organization**. An auditor in org A has no
  access to org B.
- `access:manage` is owner-only for the MVP. Delegation to managers is a post-MVP option.
- `reports:view-limited` gives a field worker one report: **My entries**, the daily records
  they entered themselves, for up to 31 days at a time. It covers egg counts, water, deaths
  and feed. Anyone with `production:record` can run it too. Field workers can't run or
  export the organization reports.
- **Report access is checked per report type**, not per route: `canRunReport` in
  `@farmos/shared-types` lists the permissions for each type. A report job is re-checked
  against the requester's current role when the worker runs it.
- **Report jobs, their files and notifications are private** to the member they belong to;
  owners can't read them. Each member sets their own email preferences.
- Frontend role-based rendering is for usability only. The API is the security boundary.
- **Four eyes on corrections:** a correction to an approved production log must be reviewed by
  someone other than the person who requested it, even if the requester holds
  `production:approve-correction`.
- **Assistant conversations are private** to the member who started them; owners can't read
  them. Each answer leaves an `assistant.answered` audit entry (status, tools used, counts).
- An organization always keeps at least one owner. Demoting or removing the last owner is
  rejected with **409**, and owner rows are locked during the check so concurrent requests cannot
  both succeed.

## What each permission unlocks

| Permission                      | Allows                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `farm:configure`                | Farms, houses, flock batches and their lifecycle; feed types; inventory items                                                        |
| `production:record`             | Daily entries, editing submitted logs, requesting corrections, inventory movements and transfers                                     |
| `production:approve-correction` | Approving production logs, reviewing corrections, voiding deaths/feed/weight records; evaluating, acknowledging and resolving alerts |
| `health:record`                 | Vaccines, vaccination schedules and outcomes, health observations                                                                    |
| `reports:view`                  | Dashboards and analytics (overview, trends, farm and flock comparisons); the organization reports and CSV exports                    |
| `reports:view-limited`          | The **My entries** report of one's own records                                                                                       |
| `audit:view`                    | The audit log                                                                                                                        |
| `ai:query`                      | The assistant. Its tools also need `reports:view`, so it can only look up what the member could see on the dashboards                |

Reading farm structure, records, health, inventory and alerts needs only membership, as do a
member's own notifications and notification preferences.
