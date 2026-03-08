CREATE TABLE "shared_report" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "token" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "config" jsonb NOT NULL,
  "expires_at" timestamp,
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_schedule" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "name" text NOT NULL,
  "cron_expression" text NOT NULL,
  "recipient_emails" jsonb NOT NULL,
  "report_range" text NOT NULL DEFAULT 'last_7_days',
  "enabled" boolean DEFAULT true NOT NULL,
  "last_sent_at" timestamp,
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shared_report" ADD CONSTRAINT "shared_report_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shared_report" ADD CONSTRAINT "shared_report_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_schedule" ADD CONSTRAINT "report_schedule_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_schedule" ADD CONSTRAINT "report_schedule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "shared_report_token_idx" ON "shared_report" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "shared_report_project_idx" ON "shared_report" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "report_schedule_project_idx" ON "report_schedule" USING btree ("project_id");
