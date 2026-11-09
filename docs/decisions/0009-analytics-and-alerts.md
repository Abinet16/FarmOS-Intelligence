# ADR-0009: Analytics and alerts

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Week 6 adds dashboards (KPIs, trends, farm and flock comparisons) and threshold alerts. Both
must agree with the [metric definitions](../architecture/metrics.md) exactly, and the plan asks
for calculations verified against known datasets.

## Decision

**Compute on read from the records, in the API, with pure functions.** Every figure is derived
from the daily inputs by the metrics module, the same code the per-flock table uses. There are
no stored aggregates to drift out of sync with corrections and voids. Inputs for any number of
flocks load in four grouped queries.

**Additive totals, not averaged rates.** Window and group figures are sums of numerators and
denominators, with the rate computed once. Averaging per-flock percentages overweights small
flocks. Tests pin this with two flocks of very different sizes.

**FCR for broilers only.** For layers it produced numbers like 27.8 from weighing noise on
birds that are no longer growing. A wrong-but-plausible KPI is worse than none.

**Alerts are evaluated, not triggered.** Rules run over a whole day for the organization:

- Each alert has a deterministic dedupe key, so evaluation is idempotent and safe to retry. That
  is a prerequisite for running it as a background job in week 8.
- Persistent conditions keep one open alert rather than one per day.
- Thresholds are per organization, stored as validated JSON over shared defaults.

Evaluating on write (after each daily entry) was rejected. It would couple record entry to
alerting, make entries slower, and still miss conditions with no entry at all, such as
missing records.

**Charts without a library.** A ~200-line SVG line chart covers what the dashboards need:
small multiples, gaps for missing days, a crosshair, keyboard reading and a table view. It
avoids a large dependency. Colours come from a palette validated for colour-vision
deficiency and contrast in both themes.

## Consequences

- Dashboards cost a few aggregate queries per request. At expected sizes (tens of flocks,
  a year at most per request) that is fine. Materialized daily aggregates are the next step if
  it isn't, and the pure functions would not change.
- Alerts are only as fresh as the last evaluation until week 8 schedules it.
- Field workers (`reports:view-limited`) see alerts but not the dashboard figures; their limited
  view arrives with reports in week 8.
