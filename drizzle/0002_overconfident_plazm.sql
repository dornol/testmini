CREATE TABLE "test_suite" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_suite_project_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "test_suite_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"suite_id" integer NOT NULL,
	"test_case_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_suite_item_unique" UNIQUE("suite_id","test_case_id")
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" text,
	"theme" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_suite" ADD CONSTRAINT "test_suite_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suite" ADD CONSTRAINT "test_suite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suite_item" ADD CONSTRAINT "test_suite_item_suite_id_test_suite_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."test_suite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suite_item" ADD CONSTRAINT "test_suite_item_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_suite_project_idx" ON "test_suite" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "test_suite_item_suite_idx" ON "test_suite_item" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "test_execution_case_version_idx" ON "test_execution" USING btree ("test_case_version_id");--> statement-breakpoint
CREATE INDEX "test_execution_executed_by_idx" ON "test_execution" USING btree ("executed_by");--> statement-breakpoint
CREATE INDEX "test_execution_executed_at_idx" ON "test_execution" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "test_failure_detail_execution_idx" ON "test_failure_detail" USING btree ("test_execution_id");