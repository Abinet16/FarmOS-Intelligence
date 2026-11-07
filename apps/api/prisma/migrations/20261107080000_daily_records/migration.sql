-- Written by hand: Prisma's generated diff drops and re-adds these columns,
-- which would lose existing records. These statements convert them in place.

-- Mortality causes become a fixed list, so reports can group by them.
CREATE TYPE "mortality_reason" AS ENUM ('DISEASE', 'INJURY', 'PREDATOR', 'HEAT_STRESS', 'CULLED', 'UNKNOWN', 'OTHER');

ALTER TABLE "mortality_events"
  ALTER COLUMN "reason_code" TYPE "mortality_reason"
  USING (CASE
    WHEN upper("reason_code") IN ('DISEASE', 'INJURY', 'PREDATOR', 'HEAT_STRESS', 'CULLED', 'UNKNOWN')
      THEN upper("reason_code")
    ELSE 'OTHER'
  END)::"mortality_reason";

-- Feed is always recorded in kilograms: the metric definitions depend on it,
-- and a per-type unit would make quantities across types incomparable.
ALTER TABLE "feed_types" DROP COLUMN "unit";

ALTER TABLE "feed_usage" RENAME COLUMN "quantity" TO "quantity_kg";
ALTER TABLE "feed_usage" DROP CONSTRAINT "feed_usage_quantity_check";
ALTER TABLE "feed_usage" ADD CONSTRAINT "feed_usage_quantity_kg_check" CHECK ("quantity_kg" > 0);

-- Approval fields are set together, exactly when a log is approved.
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_approval_check"
  CHECK (("status" = 'APPROVED') = ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL));
