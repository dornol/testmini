CREATE TABLE IF NOT EXISTS "exploratory_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
	"title" text NOT NULL,
	"charter" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"paused_duration" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"summary" text,
	"created_by" text NOT NULL REFERENCES "user"("id"),
	"environment" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "session_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL REFERENCES "exploratory_session"("id") ON DELETE CASCADE,
	"content" text NOT NULL,
	"note_type" text DEFAULT 'NOTE' NOT NULL,
	"timestamp" integer NOT NULL,
	"screenshot_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "exploratory_session_project_idx" ON "exploratory_session" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "exploratory_session_status_idx" ON "exploratory_session" USING btree ("project_id", "status");
CREATE INDEX IF NOT EXISTS "session_note_session_idx" ON "session_note" USING btree ("session_id");
