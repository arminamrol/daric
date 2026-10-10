-- Workspace scoping with row-level security (ADR-0001).
--
-- Requests that touch Workspace data run in a transaction that does
-- `SET LOCAL ROLE daric_app` and sets `app.user_id` and `app.workspace_id`.
-- daric_app is not a table owner and not a superuser, so the policies below
-- apply to it. It has no grants on identity tables at all.
--
-- Every new domain table must: grant daric_app what it needs, enable RLS and
-- add a policy on `workspace_id = (SELECT app_member_workspace_id())`.
-- A test fails for any table with a workspace_id column that lacks either.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'daric_app') THEN
    CREATE ROLE daric_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- The role the API connects as must be able to SET ROLE daric_app.
GRANT daric_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO daric_app;
--> statement-breakpoint
CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
-- The Workspace this transaction is scoped to, but only if the current User is
-- a Member of it; otherwise null, which matches no row. SECURITY DEFINER so it
-- can read workspace_members past that table's own policy. Policies call it as
-- `(SELECT app_member_workspace_id())` so it runs once per statement.
CREATE FUNCTION app_member_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT m.workspace_id
    FROM workspace_members m
    WHERE m.workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
      AND m.user_id = app_current_user_id()
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_member_workspace_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_member_workspace_id(), app_current_user_id() TO daric_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON workspaces TO daric_app;
--> statement-breakpoint
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON workspaces TO daric_app
  USING (id = (SELECT app_member_workspace_id()))
  WITH CHECK (id = (SELECT app_member_workspace_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_members TO daric_app;
--> statement-breakpoint
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON workspace_members TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
--> statement-breakpoint
-- Append-only: no UPDATE or DELETE grant.
GRANT SELECT, INSERT ON audit_logs TO daric_app;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON audit_logs TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
