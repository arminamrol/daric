CREATE TYPE "public"."snapshot_kind" AS ENUM('AUTO', 'MANUAL');--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "snapshot_kind" NOT NULL,
	"day" date NOT NULL,
	"base_currency" text NOT NULL,
	"total" bigint NOT NULL,
	"assets" bigint NOT NULL,
	"liabilities" bigint NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "net_worth_snapshots_auto_day_key" ON "net_worth_snapshots" USING btree ("workspace_id","day") WHERE "net_worth_snapshots"."kind" = 'AUTO';--> statement-breakpoint
CREATE INDEX "net_worth_snapshots_workspace_id_day_idx" ON "net_worth_snapshots" USING btree ("workspace_id","day");--> statement-breakpoint
-- A snapshot is history: it is never changed or deleted.
GRANT SELECT, INSERT ON "net_worth_snapshots" TO daric_app;
--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "net_worth_snapshots" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
