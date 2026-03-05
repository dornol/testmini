CREATE TABLE "dashboard_layout" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" integer NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "dashboard_layout_user_project_unique" UNIQUE("user_id","project_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_layout" ADD CONSTRAINT "dashboard_layout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard_layout" ADD CONSTRAINT "dashboard_layout_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "dashboard_layout_user_idx" ON "dashboard_layout" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "dashboard_layout_project_idx" ON "dashboard_layout" USING btree ("project_id");
