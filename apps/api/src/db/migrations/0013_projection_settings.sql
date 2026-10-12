CREATE TABLE "projection_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"trailing_months" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "projection_settings_trailing_months_check" CHECK ("projection_settings"."trailing_months" BETWEEN 1 AND 12)
);
--> statement-breakpoint
ALTER TABLE "projection_settings" ADD CONSTRAINT "projection_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Settings are changed in place; a Workspace's row goes with the Workspace.
GRANT SELECT, INSERT, UPDATE ON "projection_settings" TO daric_app;
--> statement-breakpoint
ALTER TABLE "projection_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "projection_settings" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
