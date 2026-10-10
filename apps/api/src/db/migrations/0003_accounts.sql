CREATE TYPE "public"."account_class" AS ENUM('ASSET', 'LIABILITY');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('CASH', 'BANK', 'CARD', 'WALLET', 'LOAN', 'ASSET');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"class" "account_class" NOT NULL,
	"currency" text NOT NULL,
	"opening_balance" bigint NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"minor_units" smallint NOT NULL,
	CONSTRAINT "currencies_minor_units_check" CHECK ("currencies"."minor_units" BETWEEN 0 AND 4)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_workspace_id_idx" ON "accounts" USING btree ("workspace_id");--> statement-breakpoint
-- The currencies `@daric/core` knows (a test keeps the two lists equal).
INSERT INTO "currencies" ("code", "minor_units") VALUES ('IRR', 0), ('USD', 2), ('EUR', 2);
--> statement-breakpoint
GRANT SELECT ON "currencies" TO daric_app;
--> statement-breakpoint
-- Accounts are archived, never deleted: no DELETE grant.
GRANT SELECT, INSERT, UPDATE ON "accounts" TO daric_app;
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "accounts" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
