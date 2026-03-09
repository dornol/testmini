CREATE INDEX IF NOT EXISTS "test_execution_version_id_desc_idx" ON "test_execution" USING btree ("test_case_version_id","id");
