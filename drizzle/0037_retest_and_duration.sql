ALTER TABLE "test_run" ADD COLUMN "retest_of_run_id" integer;
ALTER TABLE "test_execution" ADD COLUMN "started_at" timestamp;
ALTER TABLE "test_execution" ADD COLUMN "completed_at" timestamp;
