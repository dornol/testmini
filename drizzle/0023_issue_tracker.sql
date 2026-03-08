-- Issue tracker integration: config per project + issue links to test entities

CREATE TABLE IF NOT EXISTS "issue_tracker_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "base_url" text NOT NULL,
  "api_token" text,
  "project_key" text,
  "custom_template" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "issue_tracker_config_project_unique" UNIQUE("project_id")
);

CREATE TABLE IF NOT EXISTS "issue_link" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "test_case_id" integer REFERENCES "test_case"("id") ON DELETE CASCADE,
  "test_execution_id" integer REFERENCES "test_execution"("id") ON DELETE CASCADE,
  "external_url" text NOT NULL,
  "external_key" text,
  "title" text,
  "status" text,
  "provider" text NOT NULL,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "issue_link_project_idx" ON "issue_link" ("project_id");
CREATE INDEX IF NOT EXISTS "issue_link_test_case_idx" ON "issue_link" ("test_case_id");
CREATE INDEX IF NOT EXISTS "issue_link_test_execution_idx" ON "issue_link" ("test_execution_id");
