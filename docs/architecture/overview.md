# Architecture overview

FarmOS Intelligence is a **modular monolith**: one deployable API process with strict
module boundaries, a separate background worker, and a Next.js web client. See
[ADR-0001](../decisions/0001-modular-monolith.md) for why.

```mermaid
flowchart TB
  subgraph Client
    WEB[Next.js web app<br/>TypeScript · Ant Design · Tailwind]
  end

  subgraph API["NestJS API (apps/api)"]
    direction TB
    GUARDS[Auth · Tenant scope · Permission guards · DTO validation]
    subgraph Modules
      AUTH[Auth & Users]
      ORG[Organizations & Memberships]
      FARM[Farms · Houses · Flocks]
      OPS[Production · Mortality · Feed · Weights]
      HEALTH[Health & Vaccinations]
      INV[Inventory]
      ANALYTICS[Analytics · Alerts · Reports]
      AI[AI Assistant]
      AUDIT[Audit]
    end
    GUARDS --> Modules
  end

  WORKER["Worker (apps/worker)<br/>BullMQ processors"]
  PG[(PostgreSQL<br/>source of truth)]
  REDIS[(Redis<br/>queues · cache)]
  LLM[LLM provider]
  S3[(Object storage<br/>reports · exports)]

  WEB -- HTTPS / REST / JSON --> GUARDS
  Modules --> PG
  Modules -- enqueue --> REDIS
  REDIS --> WORKER
  WORKER --> PG
  WORKER --> S3
  AI -- validated tool calls only --> LLM
```

## Request flow

1. The user authenticates.
2. The API resolves organization membership for the requested tenant.
3. A guard checks the membership's role against the permission matrix
   ([permissions.md](permissions.md)).
4. DTO validation rejects malformed input.
5. A domain service applies business rules.
6. The repository runs tenant-scoped queries; composite foreign keys and (later) row-level
   security back this up in the database.
7. An audit entry and any background jobs are recorded in the same transaction (outbox).
8. The API returns a documented response.

## Repository layout

| Path                     | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `apps/api`               | NestJS API, Prisma schema and migrations                   |
| `apps/web`               | Next.js App Router client                                  |
| `apps/worker`            | BullMQ processors (added in week 8)                        |
| `packages/shared-types`  | Roles, permissions and DTO contracts shared by API and web |
| `packages/tsconfig`      | Shared TypeScript configuration                            |
| `packages/eslint-config` | Shared ESLint flat config                                  |
| `infra/docker`           | Container images                                           |
| `docs/`                  | Architecture, decisions (ADRs), API docs                   |

## Environments

| Environment | Composition                                                               |
| ----------- | ------------------------------------------------------------------------- |
| Local       | `docker compose` for PostgreSQL + Redis; API and web run with `pnpm dev`  |
| CI          | GitHub Actions with a PostgreSQL service container                        |
| Demo        | Managed PostgreSQL, container-hosted API and worker, hosted web (week 10) |
