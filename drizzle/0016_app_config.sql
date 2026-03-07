CREATE TABLE IF NOT EXISTS "app_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_name" text DEFAULT 'testmini' NOT NULL,
	"logo_url" text,
	"favicon_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
