-- Custom field definitions (per-project)
CREATE TABLE IF NOT EXISTS "custom_field" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "field_type" text NOT NULL,
  "options" jsonb,
  "required" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "custom_field_project_name_unique" UNIQUE("project_id", "name")
);

CREATE INDEX IF NOT EXISTS "custom_field_project_idx" ON "custom_field" ("project_id");

-- Add custom fields JSONB column to test_case_version
ALTER TABLE "test_case_version" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb;
