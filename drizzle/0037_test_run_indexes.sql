CREATE INDEX IF NOT EXISTS "test_run_project_created_idx" ON "test_run" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_run_project_status_idx" ON "test_run" USING btree ("project_id","status");
