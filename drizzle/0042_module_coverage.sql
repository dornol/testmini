CREATE TABLE IF NOT EXISTS "module" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "parent_module_id" integer REFERENCES "module"("id") ON DELETE SET NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "module_project_idx" ON "module" ("project_id");
CREATE UNIQUE INDEX "module_project_name_parent_unique" ON "module" ("project_id", "name", COALESCE("parent_module_id", 0));

CREATE TABLE IF NOT EXISTS "module_test_case" (
  "id" serial PRIMARY KEY,
  "module_id" integer NOT NULL REFERENCES "module"("id") ON DELETE CASCADE,
  "test_case_id" integer NOT NULL REFERENCES "test_case"("id") ON DELETE CASCADE,
  "added_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "module_test_case_unique" ON "module_test_case" ("module_id", "test_case_id");
CREATE INDEX "module_test_case_module_idx" ON "module_test_case" ("module_id");
CREATE INDEX "module_test_case_tc_idx" ON "module_test_case" ("test_case_id");
