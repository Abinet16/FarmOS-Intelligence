-- Row-level security: defence in depth for tenant isolation (ADR-0002).
--
-- The API connects as a login role that is a member of farmos_app. That role is
-- not the table owner and has no BYPASSRLS, so every policy below applies to it.
-- Each request runs in a transaction that sets:
--   app.current_organization_id  the tenant the request is scoped to
--   app.current_user_id          the authenticated user
-- with set_config(..., true), so the values vanish when the transaction ends.
-- A query that runs without that context sees no tenant rows at all (fail closed).
--
-- The migration role keeps full access because owners bypass RLS unless FORCE is
-- set; that is what migrations, seeds and owner-level integrity tests rely on.
-- Creating the role requires CREATEROLE on managed PostgreSQL services.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'farmos_app') THEN
    CREATE ROLE farmos_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO farmos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO farmos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO farmos_app;
REVOKE ALL ON "_prisma_migrations" FROM farmos_app;
-- Audit history is append-only for the application, on top of the trigger.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM farmos_app;

-- NULLIF turns the empty string a reset setting leaves behind into NULL, and
-- NULL never equals anything, so a missing context matches no rows.
CREATE FUNCTION app_current_organization_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
$$;

CREATE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

-- organizations: full access inside the tenant context; members can also read
-- the organizations they belong to (used to list "my organizations").
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizations_tenant" ON "organizations"
  USING ("id" = app_current_organization_id())
  WITH CHECK ("id" = app_current_organization_id());
CREATE POLICY "organizations_member_read" ON "organizations" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "memberships" m
    WHERE m."organization_id" = "organizations"."id" AND m."user_id" = app_current_user_id()
  ));

-- memberships: full access inside the tenant context; users can read their own
-- memberships across organizations (needed to resolve which tenant they may enter).
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships_tenant" ON "memberships"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
CREATE POLICY "memberships_self_read" ON "memberships" FOR SELECT
  USING ("user_id" = app_current_user_id());

-- Every other tenant-owned table: rows are visible and writable only inside
-- their own organization's context.

ALTER TABLE "farms" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farms_tenant" ON "farms"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "houses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "houses_tenant" ON "houses"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "flock_batches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flock_batches_tenant" ON "flock_batches"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "production_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "production_logs_tenant" ON "production_logs"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "production_log_corrections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "production_log_corrections_tenant" ON "production_log_corrections"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "mortality_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mortality_events_tenant" ON "mortality_events"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "feed_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_types_tenant" ON "feed_types"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "feed_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_usage_tenant" ON "feed_usage"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "weight_samples" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weight_samples_tenant" ON "weight_samples"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "vaccines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vaccines_tenant" ON "vaccines"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "vaccination_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vaccination_records_tenant" ON "vaccination_records"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "health_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health_events_tenant" ON "health_events"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_items_tenant" ON "inventory_items"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_movements_tenant" ON "inventory_movements"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_tenant" ON "alerts"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant" ON "audit_logs"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "report_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_jobs_tenant" ON "report_jobs"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conversations_tenant" ON "ai_conversations"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_messages_tenant" ON "ai_messages"
  USING ("organization_id" = app_current_organization_id())
  WITH CHECK ("organization_id" = app_current_organization_id());
