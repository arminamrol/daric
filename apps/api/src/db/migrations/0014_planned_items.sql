CREATE TYPE "public"."planned_item_kind" AS ENUM('FIXED_MONTHLY', 'ONE_OFF');--> statement-breakpoint
CREATE TYPE "public"."projection_mode" AS ENUM('AUTOMATIC', 'MANUAL', 'COMBINED');--> statement-breakpoint
CREATE TABLE "planned_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "planned_item_kind" NOT NULL,
	"type" "category_kind" NOT NULL,
	"category_id" uuid,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "planned_items_amount_check" CHECK ("planned_items"."amount" > 0),
	CONSTRAINT "planned_items_end_on_check" CHECK ("planned_items"."end_on" >= "planned_items"."start_on"),
	CONSTRAINT "planned_items_name_check" CHECK (char_length("planned_items"."name") <= 100),
	CONSTRAINT "planned_items_kind_check" CHECK (("planned_items"."kind" = 'FIXED_MONTHLY' AND "planned_items"."category_id" IS NOT NULL) OR ("planned_items"."kind" = 'ONE_OFF' AND "planned_items"."end_on" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "projection_settings" ADD COLUMN "mode" "projection_mode" DEFAULT 'AUTOMATIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "planned_items" ADD CONSTRAINT "planned_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_items" ADD CONSTRAINT "planned_items_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_items" ADD CONSTRAINT "planned_items_category_fk" FOREIGN KEY ("category_id","workspace_id","type") REFERENCES "public"."categories"("id","workspace_id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_items_workspace_id_idx" ON "planned_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "planned_items_category_id_idx" ON "planned_items" USING btree ("category_id");--> statement-breakpoint
-- Nothing refers to a Planned Item, so it is deleted outright.
GRANT SELECT, INSERT, UPDATE, DELETE ON "planned_items" TO daric_app;
--> statement-breakpoint
ALTER TABLE "planned_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "planned_items" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
