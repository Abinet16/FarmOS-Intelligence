# Alerts

Alerts point people at recorded data that needs attention. They compare numbers with
thresholds; they never name a cause. Rules are pure functions in
[`alert-rules.ts`](../../apps/api/src/modules/alerts/alert-rules.ts), unit-tested in
`alert-rules.spec.ts`.

## Rules

| Rule                   | Fires when (for day _d_)                                                                    | Severity                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `HIGH_DAILY_MORTALITY` | daily mortality ≥ `dailyMortalityPct`                                                       | High; **critical** at ≥ 2× the threshold |
| `HEN_DAY_DROP`         | laying flock; hen-day on _d_ is ≥ `henDayDropPoints` below the previous 7 days' hen-day     | Medium; **high** at ≥ 2× the threshold   |
| `FEED_INTAKE_DROP`     | feed per bird on _d_ is ≥ `feedDropPct` % below the previous 7 days'                        | Medium                                   |
| `MISSING_RECORDS`      | active flock, placed before _d_, with no egg count (laying flocks) or no feed record on _d_ | Low                                      |
| `VACCINATION_OVERDUE`  | a scheduled vaccination for a planned or active flock is dated before _d_                   | Medium                                   |
| `LOW_STOCK`            | an item's balance at a farm is at or below its reorder level                                | Medium; **high** when nothing is left    |

Baselines need at least three recorded days in the previous seven; otherwise the comparison
is skipped rather than guessed. Baseline rates use the window rules in
[metric definitions](metrics.md#windows-and-groups-of-flocks).

## Thresholds

Each organization can change them (`PUT …/alert-settings`, `farm:configure`) and switch rules
off. Defaults (`DEFAULT_ALERT_SETTINGS` in `@farmos/shared-types`):

| Setting             | Default  |
| ------------------- | -------- |
| `dailyMortalityPct` | 0.5 %    |
| `henDayDropPoints`  | 5 points |
| `feedDropPct`       | 20 %     |

## Evaluation and deduplication

`POST …/alerts/evaluate` checks one day, by default **yesterday** in the organization's time
zone, the last complete day. It is safe to run any number of times:

- Every alert has a deterministic `dedupe_key` = `rule:subject:day`, unique per organization,
  and inserts skip duplicates. Re-running the same day never adds alerts.
- **Daily** rules (mortality, drops, missing records) raise one alert per flock per day.
- **Persistent** rules (overdue vaccination, low stock) keep **one unresolved alert per
  subject**, however many days the condition lasts. Once it is resolved, a still-true
  condition raises a fresh alert.

The worker evaluates every active organization hourly (`ALERT_EVALUATION_CRON`, UTC). Each
run checks the organization's last complete day, recorded in the audit log with no actor and
`scheduled: true`. Supervisors can still run it from the dashboard, for example for an earlier
date. New alerts send one summary notification to each person who acts on them; see
[reports-and-jobs.md](reports-and-jobs.md#notifications).

## Lifecycle

`OPEN → ACKNOWLEDGED → RESOLVED`, or `OPEN → RESOLVED`. Who acknowledged or resolved an alert
and when are stored on the row (CHECK constraints keep them consistent with the status), and
each step is audited. Any member can read alerts; acknowledging, resolving and evaluating need
`production:approve-correction`.
