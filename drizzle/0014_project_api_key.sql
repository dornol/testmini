-- Create project_api_key table for CI authentication
CREATE TABLE "project_api_key" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "prefix" text NOT NULL,
  "last_used_at" timestamp,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "project_api_key_hash_unique" ON "project_api_key" ("key_hash");
CREATE INDEX "project_api_key_project_idx" ON "project_api_key" ("project_id");
CREATE INDEX "project_api_key_hash_idx" ON "project_api_key" ("key_hash");
