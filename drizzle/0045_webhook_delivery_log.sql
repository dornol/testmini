CREATE TABLE IF NOT EXISTS "webhook_delivery_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" integer NOT NULL REFERENCES "project_webhook"("id") ON DELETE CASCADE,
	"event" text NOT NULL,
	"url" text NOT NULL,
	"request_body" text,
	"status_code" integer,
	"response_body" text,
	"success" boolean NOT NULL,
	"error_message" text,
	"attempt" integer NOT NULL DEFAULT 1,
	"duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "webhook_delivery_log_webhook_idx" ON "webhook_delivery_log" ("webhook_id");
CREATE INDEX IF NOT EXISTS "webhook_delivery_log_created_idx" ON "webhook_delivery_log" ("created_at");
