# Metric definitions

Every report, dashboard and AI tool computes metrics with these definitions. A metric
that does not match this page is a bug.

General rules:

- **Day boundary:** a day is a calendar date in the organization's `timezone`.
- **Live birds at day open** (`opening_birds(d)`) =
  `initial_birds − Σ mortality.quantity for event_date < d`.
- **Missing data:** if a required input is missing for a day, the metric is `null` for that
  day, never `0`. Aggregates over a window report how many days had data.
- **Rounding:** store unrounded values; round only for display (2 decimal places).

| Metric                        | Formula                               | Unit        | Denominator                                 | Notes                                                                  |
| ----------------------------- | ------------------------------------- | ----------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| Daily mortality rate          | `deaths(d) / opening_birds(d) × 100`  | %           | Opening population                          | `null` if `opening_birds(d) = 0`                                       |
| Cumulative mortality          | `Σ deaths(≤ d) / initial_birds × 100` | %           | Initial placement                           |                                                                        |
| Feed per bird                 | `feed_kg(d) / avg_birds(d)`           | kg/bird/day | `(opening_birds(d) + closing_birds(d)) / 2` | Not FCR. Requires feed recorded in kg.                                 |
| Egg production rate (hen-day) | `eggs(d) / opening_birds(d) × 100`    | %           | Opening population                          | Layer and breeder batches                                              |
| Feed conversion ratio (FCR)   | `feed_kg / live_weight_gain_kg`       | ratio       | —                                           | Only reported when weight samples bracket the window; otherwise `null` |

- **Feed** is recorded in kilograms only.
- **Weight:** several samples on one day combine weighted by sample size.

## Implementation

The daily metrics (all rows except FCR) are implemented in
[`flock-metrics.ts`](../../apps/api/src/modules/metrics/flock-metrics.ts) and served by
`GET …/flock-batches/:batchId/daily-metrics`. They are unit-tested against a hand-calculated
fixture (`flock-metrics.spec.ts`), and the same fixture is checked through the API in
`flock-records.int-spec.ts`. FCR and window aggregates arrive with the dashboards in week 6.
