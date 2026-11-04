# ADR-0001: Modular monolith

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

The MVP has around fifteen business modules, one developer, and a 10–12 week schedule. The
modules share one relational model and many queries cross module lines (analytics reads
every operational table).

## Decision

Build one NestJS API process organized by business module (`src/modules/<domain>`), plus a
separate worker process for background jobs. Modules talk to each other through exported
services, not through each other's repositories or tables.

## Consequences

- One deployment, one database, ordinary transactions across modules.
- Boundaries are enforced by convention and code review rather than by the network. ESLint
  import restrictions can be added if boundaries erode.
- A module with a distinct scaling profile (likely the AI assistant or report generation) can
  be extracted later because it already sits behind a service interface.
- Kubernetes and service meshes are explicitly out of scope.
