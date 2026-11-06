# FarmOS Intelligence

A multi-tenant farm operations and decision-support platform, starting with poultry production.
Farm teams record daily operations; managers get validated metrics, threshold alerts, and an AI
assistant whose answers are grounded in their own records.

> **Status:** v0.1 (Secure foundation) is done; v0.2 (Farm operations) is in progress. See the [roadmap](#roadmap).

## Stack

| Layer    | Choice                                                         |
| -------- | -------------------------------------------------------------- |
| Web      | Next.js (App Router), TypeScript, Tailwind CSS, TanStack Query |
| API      | NestJS, Prisma 7, PostgreSQL 17                                |
| Jobs     | Redis + BullMQ                                                 |
| Tooling  | pnpm workspaces, Turborepo, ESLint, Prettier, Vitest           |
| Delivery | Docker, GitHub Actions                                         |

## Quick start

Prerequisites: Node 22+, pnpm 11+, Docker.

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env           # set BETTER_AUTH_SECRET: openssl rand -base64 32
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm db:up                                       # PostgreSQL + Redis
pnpm --filter @farmos/api prisma:migrate:deploy  # apply migrations (as the owner role)
pnpm --filter @farmos/api db:app-user            # create the RLS-restricted runtime role
pnpm dev                                         # API on :4000, web on :3000
```

Then open http://localhost:3000, create an account and an organization, then add farms,
houses and flocks.

Check the API:

```bash
curl localhost:4000/health/live    # {"status":"ok"}
curl localhost:4000/health/ready   # {"status":"ok","checks":{"database":"up"}}
```

## Common commands

| Command                 | What it does                                               |
| ----------------------- | ---------------------------------------------------------- |
| `pnpm lint`             | ESLint across all packages                                 |
| `pnpm typecheck`        | TypeScript checks across all packages                      |
| `pnpm test`             | Unit tests                                                 |
| `pnpm test:integration` | Integration tests against the database in `DATABASE_URL`   |
| `pnpm db:migration:new` | Write a migration from `schema.prisma` changes (see below) |
| `pnpm format`           | Prettier                                                   |

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Data model and integrity rules](docs/architecture/data-model.md)
- [Permission matrix](docs/architecture/permissions.md)
- [Security model](docs/architecture/security.md)
- [API reference](docs/api/README.md)
- [Metric definitions](docs/architecture/metrics.md)
- [Architecture decision records](docs/decisions/README.md)

## Roadmap

| Milestone                   | Weeks | Outcome                                           |
| --------------------------- | ----- | ------------------------------------------------- |
| v0.1 — Secure foundation    | 1–2   | Repo, CI, schema, auth, tenant isolation, audit   |
| v0.2 — Farm operations      | 3–5   | Farms, houses, flocks, daily records, corrections |
| v0.3 — Analytics and alerts | 6     | Verified KPIs, dashboards, threshold alerts       |
| v0.4 — AI decision support  | 7–8   | Grounded assistant, evaluation set, reports, jobs |
| v0.5 — Production release   | 9–10  | Hardening, observability, deployed demo           |

## Product boundary

The AI assistant summarizes records, explains calculated trends, and suggests checks. It does
not diagnose disease, prescribe medication, or modify production records.
