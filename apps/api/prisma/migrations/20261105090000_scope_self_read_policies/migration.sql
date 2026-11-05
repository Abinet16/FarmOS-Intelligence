-- Permissive RLS policies are OR-ed together. The self-read policies from
-- tenant_rls therefore stayed active inside a tenant context, and a member
-- listing for organization A also returned the caller's own memberships in
-- other organizations. Self-read now applies only when no tenant is selected,
-- so inside a tenant context exactly one organization's rows are visible.

DROP POLICY "memberships_self_read" ON "memberships";
CREATE POLICY "memberships_self_read" ON "memberships" FOR SELECT
  USING (app_current_organization_id() IS NULL AND "user_id" = app_current_user_id());

DROP POLICY "organizations_member_read" ON "organizations";
CREATE POLICY "organizations_member_read" ON "organizations" FOR SELECT
  USING (
    app_current_organization_id() IS NULL
    AND EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m."organization_id" = "organizations"."id" AND m."user_id" = app_current_user_id()
    )
  );
