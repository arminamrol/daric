CREATE TABLE "account_valuations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"valued_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "account_valuations_account_day_key" UNIQUE("account_id","valued_on"),
	CONSTRAINT "account_valuations_amount_check" CHECK ("account_valuations"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "account_valuations" ADD CONSTRAINT "account_valuations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_valuations" ADD CONSTRAINT "account_valuations_account_fk" FOREIGN KEY ("account_id","workspace_id") REFERENCES "public"."accounts"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_valuations_workspace_id_idx" ON "account_valuations" USING btree ("workspace_id");--> statement-breakpoint
-- A Valuation is a correction the user makes, not history: nothing refers to one, so it is deleted outright.
GRANT SELECT, INSERT, UPDATE, DELETE ON "account_valuations" TO daric_app;
--> statement-breakpoint
ALTER TABLE "account_valuations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "account_valuations" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
