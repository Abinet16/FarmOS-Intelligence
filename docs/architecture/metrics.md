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

| Metric                        | Formula                               | Unit        | Denominator                                 | Notes                                                      |
| ----------------------------- | ------------------------------------- | ----------- | ------------------------------------------- | ---------------------------------------------------------- |
| Daily mortality rate          | `deaths(d) / opening_birds(d) × 100`  | %           | Opening population                          | `null` if `opening_birds(d) = 0`                           |
| Cumulative mortality          | `Σ deaths(≤ d) / initial_birds × 100` | %           | Initial placement                           |                                                            |
| Feed per bird                 | `feed_kg(d) / avg_birds(d)`           | kg/bird/day | `(opening_birds(d) + closing_birds(d)) / 2` | Not FCR. Requires feed recorded in kg.                     |
| Egg production rate (hen-day) | `eggs(d) / opening_birds(d) × 100`    | %           | Opening population                          | Layer and breeder batches                                  |
| Feed conversion ratio (FCR)   | `feed_kg / live_weight_gain_kg`       | ratio       | —                                           | Broilers only; see [FCR](#feed-conversion-ratio-fcr) below |

- **Feed** is recorded in kilograms only.
- **Weight:** several samples on one day combine weighted by sample size.

## Windows and groups of flocks

Dashboards report a **window** (a date range) for one flock, a farm or the whole organization.
Window figures are built from **additive totals**, so they combine correctly:

| Total              | Definition                                                    |
| ------------------ | ------------------------------------------------------------- |
| `starting_birds`   | `opening_birds` on the window's first day (per flock, summed) |
| `deaths`           | `Σ deaths(d)` over the window                                 |
| `eggs`             | `Σ eggs(d)` over days with an egg count (laying flocks)       |
| `laying_bird_days` | `Σ opening_birds(d)` over the same days                       |
| `feed_kg`          | `Σ feed_kg(d)` over days with feed records                    |
| `feed_bird_days`   | `Σ avg_birds(d)` over the same days                           |

| Window KPI    | Formula                                  |
| ------------- | ---------------------------------------- |
| Hen-day       | `eggs / laying_bird_days × 100`          |
| Mortality     | `deaths / starting_birds × 100`          |
| Feed per bird | `feed_kg / feed_bird_days` (kg/bird/day) |

**Rates are never averaged.** For a farm or the organization, totals are summed across flocks
first and the rate is computed once. A 9,000-bird flock at 90% and a 1,000-bird flock at 50%
make 86%, not 70%. The same rule applies to each day of the organization-wide trend.

### Feed conversion ratio (FCR)

`FCR = feed eaten / live-weight gain`, both in kg, between the **first and last weigh days in
the window**:

- **Feed:** the sum of `feed_kg(d)` for days after the first weigh day, up to and including the
  last.
- **Gain:** `avg_weight(last) × opening_birds(last) − avg_weight(first) × opening_birds(first)`.

FCR is `null` when:

- there are fewer than two weigh days;
- any day in the span lacks a feed record;
- the gain is not positive; or
- the flock is not a **broiler** flock. Adult layers barely gain weight, so the ratio is
  meaningless for them. Layer efficiency is feed per kg of eggs, which needs egg weights
  FarmOS doesn't record.

### Verification

The definitions are checked three ways:

1. A hand-worked 4-day layer fixture (`flock-metrics.spec.ts`).
2. A **known dataset**: 15 days of a 2,000-bird broiler flock in
   [`broiler-15-days.csv`](../../apps/api/src/modules/metrics/__fixtures__/broiler-15-days.csv).
   Its expected values were computed independently of the TypeScript code
   (`window-metrics.spec.ts`).
3. Two flocks of different sizes checked end to end through the API
   (`analytics.int-spec.ts`), including the weighted-rate rule above.

## Implementation

The daily metrics are implemented in
[`flock-metrics.ts`](../../apps/api/src/modules/metrics/flock-metrics.ts) and served by
`GET …/flock-batches/:batchId/daily-metrics`. They are unit-tested against a hand-calculated
fixture (`flock-metrics.spec.ts`), and the same fixture is checked through the API in
`flock-records.int-spec.ts`. Window totals, combined days and FCR live in the same module and
are served by the `analytics` endpoints.
