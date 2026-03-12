CREATE TABLE IF NOT EXISTS "test_cycle" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "release_id" integer REFERENCES "release"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "cycle_number" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "start_date" timestamp,
  "end_date" timestamp,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "test_cycle_project_idx" ON "test_cycle" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "test_cycle_project_number_unique" ON "test_cycle" ("project_id", "cycle_number");

ALTER TABLE "test_run" ADD COLUMN IF NOT EXISTS "test_cycle_id" integer REFERENCES "test_cycle"("id") ON DELETE SET NULL;
