# ADR-0008: Corrections, health records and inventory

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Week 4 made daily records strict: approved production logs are locked, and deaths, feed and
weights can't be edited. Week 5 needed a way to fix mistakes without breaking that promise,
plus vaccination, health and inventory records.

## Decision

### Two correction paths, both leaving history intact

**Approved production logs: request and review.** A user with `production:record` proposes
new values with a reason. A user with `production:approve-correction` approves or rejects it.
Rules:

- **Four eyes.** Nobody can review their own request (403). A small farm whose only reviewer
  is the requester needs a second reviewer; this is deliberate.
- **One pending correction per log**, enforced by a partial unique index.
- **Proposals hold only real changes.** Values equal to the log's current ones are dropped,
  and a request that changes nothing is a 400.
- **Approval re-checks the rules against the flock as it is now.** For example, eggs can't
  exceed the birds alive that day, even if deaths changed since the request.
- **Approval is one transaction:** it updates the log, marks the correction reviewed, and
  writes a `production_log.corrected` audit event with the before and after values.
- Rejection requires a note.

**Deaths, feed and weights: void and re-enter.** A reviewer voids a wrong record with a
reason. The row stays (with who, when and why, all required together by a CHECK constraint)
but drops out of every total: live birds, the egg cap, daily metrics. The correct value is then
entered as a new record. Edits in place would make the audit trail and any figure computed
earlier unexplainable.

### Health records are observations

Health events use a fixed list of **observed** categories (respiratory, digestive…) and a
severity, never a disease name. That keeps the product inside its boundary: it records what
people saw and leaves diagnosis to a veterinarian. Vaccinations are scheduled, then
**administered, missed or cancelled**; each outcome is final. Giving a vaccine with a
recommended interval can schedule the booster in the same transaction. The org-wide
`?dueWithinDays=` view lists what's due, including overdue doses, for the dashboards and the
assistant later.

### Inventory: stock is derived, never stored

Every change is an `inventory_movements` row with a positive quantity and a type that carries
the direction. A balance is the signed sum of an item's movements at a farm, computed with
exact decimals (`1000.5 − 0.1 − 0.2` is `1000.2`, not `1000.1999…`).

- Issues, outbound adjustments and transfers **can't take a farm below zero**. All movements
  of an item serialize on a row lock on the item, so two issues can't spend the same stock.
- A transfer is a `TRANSFER_OUT`/`TRANSFER_IN` pair sharing a `transfer_id`. A CHECK
  constraint requires the id on transfer rows and forbids it elsewhere.
- Reorder levels flag item/farm balances at or below them.

Feed usage is not yet linked to feed stock, because feed types and inventory items are
separate lists. Linking them is a candidate for week 8.

## Consequences

- Every number on a screen can be traced to rows and audit events. Nothing is edited out of
  existence.
- Corrections slow down fixes to approved logs; that friction is the point.
- Stock queries aggregate movements on every read. At the expected volume (hundreds of
  movements per item per year) this is cheap. A materialized balance would be the
  optimization if it ever isn't.
