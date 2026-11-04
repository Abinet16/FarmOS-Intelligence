# ADR-0004: ESM API with Vitest

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

NestJS 12 ships as ES modules only. The original plan called for Jest, but Jest can only load
ESM dependencies from CommonJS tests on Node 24.9+, and the team baseline is Node 22.

## Decision

Run the API as native ESM (`"type": "module"`, `NodeNext` resolution, explicit `.js`
import suffixes) and test it with Vitest, matching Nest 12's official `ts-esm` application
template. Prisma generates an ESM client. Supertest is still used for HTTP-level tests and
Playwright for end-to-end tests.

## Consequences

- Works on Node 22 and later with no experimental flags.
- Types referenced in decorated constructor parameters must use `import type` when they are
  not runtime values (required by `isolatedModules`).
- Vitest's Jest-compatible API (`describe`, `it`, `expect`, `vi.fn`) keeps tests familiar.
