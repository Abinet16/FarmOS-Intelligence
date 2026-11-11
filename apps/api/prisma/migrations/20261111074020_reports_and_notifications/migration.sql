-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "job_status" ADD VALUE 'EXPIRED';

-- DropIndex
DROP INDEX "report_jobs_organization_id_created_at_idx";

-- AlterTable
ALTER TABLE "report_jobs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "row_count" INTEGER,
ADD COLUMN     "started_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "email_status" "email_status" NOT NULL DEFAULT 'NONE',
    "emailed_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email_alerts_min_severity" "severity",
    "email_reports" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateIndex
CREATE INDEX "notifications_organization_id_user_id_created_at_idx" ON "notifications"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_organization_id_email_status_idx" ON "notifications"("organization_id", "email_status");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organization_id_user_id_dedupe_key_key" ON "notifications"("organization_id", "user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "report_jobs_organization_id_requested_by_created_at_idx" ON "report_jobs"("organization_id", "requested_by", "created_at");

-- CreateIndex
CREATE INDEX "report_jobs_organization_id_status_idx" ON "report_jobs"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- A finished report always has its file and row count.
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_row_count_check"
  CHECK ("row_count" IS NULL OR "row_count" >= 0);
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_succeeded_check"
  CHECK ("status" <> 'SUCCEEDED' OR ("file_key" IS NOT NULL AND "row_count" IS NOT NULL
    AND "completed_at" IS NOT NULL AND "expires_at" IS NOT NULL));
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_error_length_check"
  CHECK ("error" IS NULL OR char_length("error") <= 500);

-- Notifications are short and link inside the app only.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_title_length_check"
  CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_body_length_check"
  CHECK (char_length("body") <= 1000);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_link_check"
  CHECK ("link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%'));

-- Row-level security, as for every tenant-owned table (ADR-0002). The
-- services also filter on user_id: a notification is private to its recipient.
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_tenant" ON "notifications"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_preferences_tenant" ON "notification_preferences"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

-- Scheduled jobs run for every organization, but the runtime role can't see
-- organizations without a tenant context. This function returns only the ids
-- of active organizations; each job then works inside one tenant context.
CREATE FUNCTION app_active_organization_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "id" FROM "organizations" WHERE "status" = 'ACTIVE' ORDER BY "id"
$$;
REVOKE ALL ON FUNCTION app_active_organization_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_active_organization_ids() TO farmos_app;
