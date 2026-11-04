-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "role" AS ENUM ('OWNER', 'MANAGER', 'SUPERVISOR', 'FIELD_WORKER', 'VETERINARIAN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "batch_status" AS ENUM ('PLANNED', 'ACTIVE', 'DEPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "record_status" AS ENUM ('SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "correction_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "vaccination_status" AS ENUM ('SCHEDULED', 'ADMINISTERED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "resolution_status" AS ENUM ('OPEN', 'MONITORING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "houses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flock_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "batch_code" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "placement_date" DATE NOT NULL,
    "initial_birds" INTEGER NOT NULL,
    "status" "batch_status" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "log_date" DATE NOT NULL,
    "eggs_collected" INTEGER NOT NULL DEFAULT 0,
    "water_consumption_litres" DECIMAL(12,2),
    "notes" TEXT,
    "status" "record_status" NOT NULL DEFAULT 'SUBMITTED',
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "production_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_log_corrections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "production_log_id" UUID NOT NULL,
    "proposed_changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "correction_status" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_log_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mortality_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mortality_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feed_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_usage" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "feed_type_id" UUID NOT NULL,
    "usage_date" DATE NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_samples" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "sample_date" DATE NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "average_weight_grams" DECIMAL(10,2) NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recommended_interval_days" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vaccines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "vaccine_id" UUID NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "administered_at" TIMESTAMPTZ(3),
    "status" "vaccination_status" NOT NULL DEFAULT 'SCHEDULED',
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vaccination_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "severity" NOT NULL,
    "description" TEXT NOT NULL,
    "resolution_status" "resolution_status" NOT NULL DEFAULT 'OPEN',
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "health_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "reorder_level" DECIMAL(14,3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "movement_type" "movement_type" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "reference" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID,
    "rule_code" TEXT NOT NULL,
    "severity" "severity" NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'OPEN',
    "dedupe_key" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "report_type" TEXT NOT NULL,
    "parameters" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'QUEUED',
    "file_key" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "ai_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "evidence_metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "farms_organization_id_id_key" ON "farms"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "farms_organization_id_name_key" ON "farms"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "houses_organization_id_id_key" ON "houses"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "houses_organization_id_farm_id_name_key" ON "houses"("organization_id", "farm_id", "name");

-- CreateIndex
CREATE INDEX "flock_batches_organization_id_house_id_idx" ON "flock_batches"("organization_id", "house_id");

-- CreateIndex
CREATE INDEX "flock_batches_organization_id_status_idx" ON "flock_batches"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "flock_batches_organization_id_id_key" ON "flock_batches"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "flock_batches_organization_id_batch_code_key" ON "flock_batches"("organization_id", "batch_code");

-- CreateIndex
CREATE INDEX "production_logs_organization_id_log_date_idx" ON "production_logs"("organization_id", "log_date");

-- CreateIndex
CREATE UNIQUE INDEX "production_logs_organization_id_id_key" ON "production_logs"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "production_logs_organization_id_batch_id_log_date_key" ON "production_logs"("organization_id", "batch_id", "log_date");

-- CreateIndex
CREATE INDEX "production_log_corrections_organization_id_status_idx" ON "production_log_corrections"("organization_id", "status");

-- CreateIndex
CREATE INDEX "mortality_events_organization_id_batch_id_event_date_idx" ON "mortality_events"("organization_id", "batch_id", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "feed_types_organization_id_id_key" ON "feed_types"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "feed_types_organization_id_name_key" ON "feed_types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "feed_usage_organization_id_batch_id_usage_date_idx" ON "feed_usage"("organization_id", "batch_id", "usage_date");

-- CreateIndex
CREATE INDEX "weight_samples_organization_id_batch_id_sample_date_idx" ON "weight_samples"("organization_id", "batch_id", "sample_date");

-- CreateIndex
CREATE UNIQUE INDEX "vaccines_organization_id_id_key" ON "vaccines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vaccines_organization_id_name_key" ON "vaccines"("organization_id", "name");

-- CreateIndex
CREATE INDEX "vaccination_records_organization_id_batch_id_scheduled_date_idx" ON "vaccination_records"("organization_id", "batch_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "vaccination_records_organization_id_status_scheduled_date_idx" ON "vaccination_records"("organization_id", "status", "scheduled_date");

-- CreateIndex
CREATE INDEX "health_events_organization_id_batch_id_observed_at_idx" ON "health_events"("organization_id", "batch_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_organization_id_id_key" ON "inventory_items"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_organization_id_name_key" ON "inventory_items"("organization_id", "name");

-- CreateIndex
CREATE INDEX "inventory_movements_organization_id_item_id_farm_id_occurre_idx" ON "inventory_movements"("organization_id", "item_id", "farm_id", "occurred_at");

-- CreateIndex
CREATE INDEX "alerts_organization_id_status_created_at_idx" ON "alerts"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_organization_id_dedupe_key_key" ON "alerts"("organization_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "report_jobs_organization_id_created_at_idx" ON "report_jobs"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_jobs_organization_id_idempotency_key_key" ON "report_jobs"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ai_conversations_organization_id_user_id_created_at_idx" ON "ai_conversations"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_organization_id_id_key" ON "ai_conversations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "ai_messages_organization_id_conversation_id_created_at_idx" ON "ai_messages"("organization_id", "conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flock_batches" ADD CONSTRAINT "flock_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flock_batches" ADD CONSTRAINT "flock_batches_organization_id_house_id_fkey" FOREIGN KEY ("organization_id", "house_id") REFERENCES "houses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "flock_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_log_corrections" ADD CONSTRAINT "production_log_corrections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_log_corrections" ADD CONSTRAINT "production_log_corrections_organization_id_production_log__fkey" FOREIGN KEY ("organization_id", "production_log_id") REFERENCES "production_logs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortality_events" ADD CONSTRAINT "mortality_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mortality_events" ADD CONSTRAINT "mortality_events_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "flock_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_types" ADD CONSTRAINT "feed_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_usage" ADD CONSTRAINT "feed_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_usage" ADD CONSTRAINT "feed_usage_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "flock_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_usage" ADD CONSTRAINT "feed_usage_organization_id_feed_type_id_fkey" FOREIGN KEY ("organization_id", "feed_type_id") REFERENCES "feed_types"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_samples" ADD CONSTRAINT "weight_samples_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_samples" ADD CONSTRAINT "weight_samples_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "flock_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccines" ADD CONSTRAINT "vaccines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "flock_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_organization_id_vaccine_id_fkey" FOREIGN KEY ("organization_id", "vaccine_id") REFERENCES "vaccines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "flock_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_item_id_fkey" FOREIGN KEY ("organization_id", "item_id") REFERENCES "inventory_items"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "flock_batches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "ai_conversations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
