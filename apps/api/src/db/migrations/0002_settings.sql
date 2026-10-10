CREATE TYPE "public"."digit_system" AS ENUM('persian', 'latin');--> statement-breakpoint
CREATE TYPE "public"."display_calendar" AS ENUM('jalali', 'gregorian');--> statement-breakpoint
CREATE TYPE "public"."theme_preference" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."money_display" AS ENUM('rial', 'toman');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_calendar" "display_calendar" DEFAULT 'jalali' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digits" "digit_system" DEFAULT 'persian' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" "theme_preference" DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "money_display" "money_display" DEFAULT 'rial' NOT NULL;