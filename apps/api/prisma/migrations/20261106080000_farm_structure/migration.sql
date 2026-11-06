-- CreateEnum
CREATE TYPE "flock_purpose" AS ENUM ('LAYER', 'BROILER', 'BREEDER');

-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "flock_batches" ADD COLUMN     "end_date" DATE,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "purpose" "flock_purpose" NOT NULL DEFAULT 'LAYER';

-- AlterTable
ALTER TABLE "houses" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);


-- A batch's end date can't precede its placement, and is set exactly when the
-- batch leaves production (depleted or closed).
ALTER TABLE "flock_batches" ADD CONSTRAINT "flock_batches_end_date_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "placement_date");
ALTER TABLE "flock_batches" ADD CONSTRAINT "flock_batches_end_date_status_check"
  CHECK (("status" IN ('DEPLETED', 'CLOSED')) = ("end_date" IS NOT NULL));

-- A house holds at most one active flock at a time.
CREATE UNIQUE INDEX "flock_batches_one_active_per_house"
  ON "flock_batches" ("organization_id", "house_id") WHERE "status" = 'ACTIVE';
