CREATE TYPE "public"."plan" AS ENUM('FREE', 'PLUS');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "plan" NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
-- Users who signed up before Plans existed get the Trial now (14 days, the TRIAL_DAYS default).
INSERT INTO "subscriptions" ("id", "user_id", "plan", "trial_ends_at", "expires_at")
SELECT gen_random_uuid(), "id", 'PLUS', now() + interval '14 days', now() + interval '14 days' FROM "users";
