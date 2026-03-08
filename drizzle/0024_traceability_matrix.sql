CREATE TABLE IF NOT EXISTS "requirement" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "external_id" text,
  "title" text NOT NULL,
  "description" text,
  "source" text,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "requirement_project_idx" ON "requirement" ("project_id");

CREATE TABLE IF NOT EXISTS "requirement_test_case" (
  "id" serial PRIMARY KEY NOT NULL,
  "requirement_id" integer NOT NULL REFERENCES "requirement"("id") ON DELETE CASCADE,
  "test_case_id" integer NOT NULL REFERENCES "test_case"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "req_tc_unique" UNIQUE("requirement_id", "test_case_id")
);
CREATE INDEX IF NOT EXISTS "req_tc_requirement_idx" ON "requirement_test_case" ("requirement_id");
CREATE INDEX IF NOT EXISTS "req_tc_test_case_idx" ON "requirement_test_case" ("test_case_id");
