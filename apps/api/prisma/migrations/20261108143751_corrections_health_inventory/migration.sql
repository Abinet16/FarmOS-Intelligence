-- AlterTable
ALTER TABLE "feed_usage" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(3),
ADD COLUMN     "voided_by" UUID;

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "transfer_id" UUID;

-- AlterTable
ALTER TABLE "mortality_events" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(3),
ADD COLUMN     "voided_by" UUID;

-- AlterTable
ALTER TABLE "production_log_corrections" ADD COLUMN     "review_note" TEXT;

-- AlterTable
ALTER TABLE "weight_samples" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(3),
ADD COLUMN     "voided_by" UUID;

-- AddForeignKey
ALTER TABLE "mortality_events" ADD CONSTRAINT "mortality_events_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_usage" ADD CONSTRAINT "feed_usage_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_samples" ADD CONSTRAINT "weight_samples_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A correction is reviewed exactly once: reviewer and time are set together,
-- and only when it leaves PENDING. One open correction per log at a time.
ALTER TABLE "production_log_corrections" ADD CONSTRAINT "production_log_corrections_review_check"
  CHECK (("status" = 'PENDING') = ("reviewed_by" IS NULL AND "reviewed_at" IS NULL));
CREATE UNIQUE INDEX "production_log_corrections_one_pending_per_log"
  ON "production_log_corrections" ("organization_id", "production_log_id") WHERE "status" = 'PENDING';

-- Voiding keeps the original row: who voided it, when, and why are all
-- required together, so a voided record always explains itself.
ALTER TABLE "mortality_events" ADD CONSTRAINT "mortality_events_void_check"
  CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL));
ALTER TABLE "feed_usage" ADD CONSTRAINT "feed_usage_void_check"
  CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL));
ALTER TABLE "weight_samples" ADD CONSTRAINT "weight_samples_void_check"
  CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL));

-- Transfers are pairs: transfer rows carry a transfer id, other movements don't.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_transfer_check"
  CHECK (("movement_type" IN ('TRANSFER_IN', 'TRANSFER_OUT')) = ("transfer_id" IS NOT NULL));
