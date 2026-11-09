-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "acknowledged_at" TIMESTAMPTZ(3),
ADD COLUMN     "acknowledged_by" UUID,
ADD COLUMN     "resolved_at" TIMESTAMPTZ(3),
ADD COLUMN     "resolved_by" UUID;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "alert_settings" JSONB;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Acknowledgement and resolution each record who and when, together; a
-- resolved alert may skip acknowledgement, but status and fields must agree.
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_check"
  CHECK (("acknowledged_by" IS NULL) = ("acknowledged_at" IS NULL));
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_check"
  CHECK (("resolved_by" IS NULL) = ("resolved_at" IS NULL) AND ("status" = 'RESOLVED') = ("resolved_at" IS NOT NULL));
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_status_check"
  CHECK ("status" <> 'ACKNOWLEDGED' OR "acknowledged_at" IS NOT NULL);
