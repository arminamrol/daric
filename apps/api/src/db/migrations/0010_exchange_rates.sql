CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"base_currency" text NOT NULL,
	"rate" numeric(30, 12) NOT NULL,
	"effective_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "exchange_rates_currency_day_key" UNIQUE("workspace_id","base_currency","currency","effective_on"),
	CONSTRAINT "exchange_rates_rate_check" CHECK ("exchange_rates"."rate" > 0),
	CONSTRAINT "exchange_rates_currency_check" CHECK ("exchange_rates"."currency" <> "exchange_rates"."base_currency")
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- A rate is a setting, not history: nothing refers to one, so it is deleted outright.
GRANT SELECT, INSERT, UPDATE, DELETE ON "exchange_rates" TO daric_app;
--> statement-breakpoint
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "exchange_rates" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
