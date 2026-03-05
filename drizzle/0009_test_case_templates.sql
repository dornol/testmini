CREATE TABLE IF NOT EXISTS "test_case_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"precondition" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_case_template" ADD CONSTRAINT "test_case_template_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "test_case_template" ADD CONSTRAINT "test_case_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_case_template_project_idx" ON "test_case_template" USING btree ("project_id");
