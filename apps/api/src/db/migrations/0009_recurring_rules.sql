CREATE TYPE "public"."occurrence_status" AS ENUM('CONFIRMED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('WEEKLY', 'MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TABLE "recurring_occurrences" (
	"rule_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" "occurrence_status" NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_occurrences_pkey" PRIMARY KEY("rule_id","due_on"),
	CONSTRAINT "recurring_occurrences_transaction_id_key" UNIQUE("transaction_id"),
	CONSTRAINT "recurring_occurrences_transaction_check" CHECK (("recurring_occurrences"."status" = 'CONFIRMED') = ("recurring_occurrences"."transaction_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "category_kind" NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"auto_post" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "recurring_rules_id_workspace_id_key" UNIQUE("id","workspace_id"),
	CONSTRAINT "recurring_rules_amount_check" CHECK ("recurring_rules"."amount" > 0),
	CONSTRAINT "recurring_rules_interval_check" CHECK ("recurring_rules"."interval" BETWEEN 1 AND 52),
	CONSTRAINT "recurring_rules_end_on_check" CHECK ("recurring_rules"."end_on" >= "recurring_rules"."start_on"),
	CONSTRAINT "recurring_rules_name_check" CHECK (char_length("recurring_rules"."name") <= 100)
);
--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_rule_fk" FOREIGN KEY ("rule_id","workspace_id") REFERENCES "public"."recurring_rules"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_transaction_fk" FOREIGN KEY ("transaction_id","workspace_id") REFERENCES "public"."transactions"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_fk" FOREIGN KEY ("account_id","workspace_id") REFERENCES "public"."accounts"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_fk" FOREIGN KEY ("category_id","workspace_id","type") REFERENCES "public"."categories"("id","workspace_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_rules_workspace_id_idx" ON "recurring_rules" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_account_id_idx" ON "recurring_rules" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_category_id_idx" ON "recurring_rules" USING btree ("category_id");-- Rules are archived, never deleted; a handled occurrence is never changed or undone.
GRANT SELECT, INSERT, UPDATE ON "recurring_rules" TO daric_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "recurring_occurrences" TO daric_app;
--> statement-breakpoint
ALTER TABLE "recurring_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "recurring_rules" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "recurring_occurrences" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
