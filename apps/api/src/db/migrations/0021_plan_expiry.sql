CREATE TYPE "public"."expiry_step" AS ENUM('REMINDER_7_DAYS', 'REMINDER_1_DAY', 'GRACE_STARTED', 'DOWNGRADED');--> statement-breakpoint
ALTER TYPE "public"."device_end_reason" ADD VALUE 'PLUS_ENDED';--> statement-breakpoint
CREATE TABLE "expiry_steps" (
	"user_id" uuid NOT NULL,
	"step" "expiry_step" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expiry_steps_user_id_expires_at_step_pk" PRIMARY KEY("user_id","expires_at","step")
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expiry_steps" ADD CONSTRAINT "expiry_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A suspended Member (their Owner's Plus and its Grace Period ended) keeps the
-- membership but no access: row-level security treats them as a non-Member.
CREATE OR REPLACE FUNCTION app_member_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT m.workspace_id
    FROM workspace_members m
    WHERE m.workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
      AND m.user_id = app_current_user_id()
      AND m.suspended_at IS NULL
  $$;
