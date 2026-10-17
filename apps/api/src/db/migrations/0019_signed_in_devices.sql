CREATE TYPE "public"."device_end_reason" AS ENUM('LOGOUT', 'REFRESH_REUSE', 'PASSWORD_RESET', 'DEVICE_LIMIT', 'SIGNED_OUT_REMOTELY');--> statement-breakpoint
CREATE TABLE "signed_in_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" "device_end_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signed_in_devices" ADD CONSTRAINT "signed_in_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signed_in_devices_user_id_idx" ON "signed_in_devices" USING btree ("user_id");--> statement-breakpoint
-- Every refresh-token family so far becomes a Signed-in Device, unnamed; one whose tokens are all revoked has ended.
INSERT INTO "signed_in_devices" ("id", "user_id", "last_used_at", "ended_at", "created_at")
SELECT "family_id", min("user_id"::text)::uuid, max("created_at"),
	CASE WHEN bool_and("revoked_at" IS NOT NULL) THEN max("revoked_at") END, min("created_at")
FROM "refresh_tokens" GROUP BY "family_id";--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_signed_in_devices_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."signed_in_devices"("id") ON DELETE cascade ON UPDATE no action;