CREATE TABLE IF NOT EXISTS "test_case_comment" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_case_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"parent_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_case_comment" ADD CONSTRAINT "test_case_comment_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_case_comment" ADD CONSTRAINT "test_case_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_case_comment" ADD CONSTRAINT "test_case_comment_parent_id_test_case_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."test_case_comment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_case_comment_case_created_idx" ON "test_case_comment" USING btree ("test_case_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_case_comment_parent_idx" ON "test_case_comment" USING btree ("parent_id");
