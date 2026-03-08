CREATE TABLE "test_case_parameter" (
  "id" serial PRIMARY KEY NOT NULL,
  "test_case_id" integer NOT NULL,
  "name" text NOT NULL,
  "order_index" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "test_case_data_set" (
  "id" serial PRIMARY KEY NOT NULL,
  "test_case_id" integer NOT NULL,
  "name" text,
  "values" jsonb NOT NULL,
  "order_index" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "shared_data_set" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "name" text NOT NULL,
  "parameters" jsonb NOT NULL DEFAULT '[]',
  "rows" jsonb NOT NULL DEFAULT '[]',
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_execution" ADD COLUMN "data_set_id" integer;
--> statement-breakpoint
ALTER TABLE "test_execution" ADD COLUMN "parameter_values" jsonb;
--> statement-breakpoint
ALTER TABLE "test_case_parameter" ADD CONSTRAINT "test_case_parameter_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "test_case"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "test_case_data_set" ADD CONSTRAINT "test_case_data_set_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "test_case"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "shared_data_set" ADD CONSTRAINT "shared_data_set_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "shared_data_set" ADD CONSTRAINT "shared_data_set_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "test_execution" ADD CONSTRAINT "test_execution_data_set_id_test_case_data_set_id_fk" FOREIGN KEY ("data_set_id") REFERENCES "test_case_data_set"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "test_case_parameter" ADD CONSTRAINT "test_case_parameter_unique" UNIQUE ("test_case_id", "name");
--> statement-breakpoint
ALTER TABLE "shared_data_set" ADD CONSTRAINT "shared_data_set_project_name_unique" UNIQUE ("project_id", "name");
--> statement-breakpoint
CREATE INDEX "test_case_parameter_case_idx" ON "test_case_parameter" ("test_case_id");
--> statement-breakpoint
CREATE INDEX "test_case_data_set_case_idx" ON "test_case_data_set" ("test_case_id");
--> statement-breakpoint
CREATE INDEX "shared_data_set_project_idx" ON "shared_data_set" ("project_id");
