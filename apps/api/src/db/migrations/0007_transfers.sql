ALTER TABLE "transactions" ADD COLUMN "to_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "to_amount" bigint;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_fk" FOREIGN KEY ("to_account_id","workspace_id") REFERENCES "public"."accounts"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_to_account_id_idx" ON "transactions" USING btree ("to_account_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_check" CHECK (CASE WHEN "transactions"."type" = 'TRANSFER' THEN "transactions"."to_account_id" IS NOT NULL AND "transactions"."to_amount" IS NOT NULL AND "transactions"."category_id" IS NULL ELSE "transactions"."to_account_id" IS NULL AND "transactions"."to_amount" IS NULL END);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_amount_check" CHECK ("transactions"."to_amount" > 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_check" CHECK ("transactions"."to_account_id" <> "transactions"."account_id");