ALTER TABLE "transactions" ADD CONSTRAINT "transactions_id_workspace_id_key" UNIQUE("id","workspace_id");--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"controllable" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "labels_id_workspace_id_key" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "transaction_labels" (
	"transaction_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_labels_pkey" PRIMARY KEY("transaction_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_labels" ADD CONSTRAINT "transaction_labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_labels" ADD CONSTRAINT "transaction_labels_transaction_fk" FOREIGN KEY ("transaction_id","workspace_id") REFERENCES "public"."transactions"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_labels" ADD CONSTRAINT "transaction_labels_label_fk" FOREIGN KEY ("label_id","workspace_id") REFERENCES "public"."labels"("id","workspace_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_workspace_id_name_key" ON "labels" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "transaction_labels_label_id_idx" ON "transaction_labels" USING btree ("label_id");--> statement-breakpoint
-- Labels are archived, never deleted: no DELETE grant.
GRANT SELECT, INSERT, UPDATE ON "labels" TO daric_app;
--> statement-breakpoint
-- Detaching a Label deletes its row; nothing else changes one.
GRANT SELECT, INSERT, DELETE ON "transaction_labels" TO daric_app;
--> statement-breakpoint
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transaction_labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "labels" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
--> statement-breakpoint
CREATE POLICY workspace_isolation ON "transaction_labels" TO daric_app
  USING (workspace_id = (SELECT app_member_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app_member_workspace_id()));
