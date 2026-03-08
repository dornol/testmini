CREATE TABLE "saved_filter" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "filter_type" text NOT NULL DEFAULT 'test_cases',
  "filters" jsonb NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "saved_filter_user_project_name_unique" UNIQUE("user_id","project_id","name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_filter" ADD CONSTRAINT "saved_filter_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_filter" ADD CONSTRAINT "saved_filter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "saved_filter_user_project_idx" ON "saved_filter" USING btree ("user_id","project_id");
