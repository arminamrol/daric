ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Users who signed up before the wizard existed have set Daric up already.
UPDATE "users" SET "onboarded_at" = now();
