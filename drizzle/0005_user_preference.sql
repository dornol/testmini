CREATE TABLE IF NOT EXISTS "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"locale" text,
	"theme" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
