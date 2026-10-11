CREATE TYPE "public"."budget_period" AS ENUM('MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"category_kind" "category_kind" GENERATED ALWAYS AS ('EXPENSE'::category_kind) STORED,
	"label_id" uuid,
	"period" "budget_period" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "budgets_workspace_id_category_id_label_id_period_key" UNIQUE NULLS NOT DISTINCT("workspace_id","category_id","label_id","period"),
	CONSTRAINT "budgets_amount_check" CHECK ("budgets"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_fk" FOREIGN KEY ("category_id","workspace_id","category_kind") REFERENCES "public"."categories"("id","workspace_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_label_fk" FOREIGN KEY ("label_id","workspace_id") REFERENCES "public"."labels"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_category_id_idx" ON "budgets" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "budgets_label_id_idx" ON "budgets" USING btree ("label_id");--> statement-breakpoint
-- Unlike Categories and Labels, nothing refers to a Budget, so it is deleted outright.
GRANT SELECT, INSERT, UPDATE, DELETE ON "budgets" TO daric_app;
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "budgets" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
