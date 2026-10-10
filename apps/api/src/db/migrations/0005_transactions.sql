ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_workspace_id_key" UNIQUE("id","workspace_id");--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('INCOME', 'EXPENSE', 'TRANSFER');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"category_kind" "category_kind" GENERATED ALWAYS AS (CASE type WHEN 'INCOME' THEN 'INCOME'::category_kind WHEN 'EXPENSE' THEN 'EXPENSE'::category_kind END) STORED,
	"amount" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "transactions_amount_check" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "transactions_category_check" CHECK ("transactions"."type" = 'TRANSFER' OR "transactions"."category_id" IS NOT NULL),
	CONSTRAINT "transactions_note_check" CHECK (char_length("transactions"."note") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("account_id","workspace_id") REFERENCES "public"."accounts"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_fk" FOREIGN KEY ("category_id","workspace_id","category_kind") REFERENCES "public"."categories"("id","workspace_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_workspace_id_occurred_on_idx" ON "transactions" USING btree ("workspace_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_account_id_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_category_id_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
-- Transactions are deleted softly (`deleted_at`), never removed: no DELETE grant.
GRANT SELECT, INSERT, UPDATE ON "transactions" TO daric_app;
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "transactions" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
