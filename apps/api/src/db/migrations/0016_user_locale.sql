CREATE TYPE "public"."locale" AS ENUM('fa', 'en');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" "locale" DEFAULT 'fa' NOT NULL;