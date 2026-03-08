-- Comments on test executions
CREATE TABLE IF NOT EXISTS "execution_comment" (
  "id" serial PRIMARY KEY NOT NULL,
  "test_execution_id" integer NOT NULL REFERENCES "test_execution"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id"),
  "content" text NOT NULL,
  "parent_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "execution_comment_exec_created_idx" ON "execution_comment" ("test_execution_id", "created_at");
CREATE INDEX IF NOT EXISTS "execution_comment_parent_idx" ON "execution_comment" ("parent_id");
