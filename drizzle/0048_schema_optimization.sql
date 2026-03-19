ALTER TABLE "test_execution" DROP CONSTRAINT "test_execution_test_case_version_id_test_case_version_id_fk";
--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "test_case" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "test_case_group" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_parent_module_id_module_id_fk" FOREIGN KEY ("parent_module_id") REFERENCES "public"."module"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_execution" ADD CONSTRAINT "test_execution_test_case_version_id_test_case_version_id_fk" FOREIGN KEY ("test_case_version_id") REFERENCES "public"."test_case_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_api_key_prefix_idx" ON "project_api_key" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "test_execution_data_set_idx" ON "test_execution" USING btree ("data_set_id");