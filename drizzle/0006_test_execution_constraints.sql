-- 0006_test_execution_constraints.sql
-- Composite index and CHECK constraint on test_execution

-- 1. Composite index for common query pattern: filter by run + status + executor
CREATE INDEX IF NOT EXISTS "test_execution_run_status_executor_idx"
  ON "test_execution" ("test_run_id", "status", "executed_by");

-- 2. CHECK constraint: PENDING executions must not have executor or execution timestamp
ALTER TABLE "test_execution"
  ADD CONSTRAINT "test_execution_status_consistency" CHECK (
    (status = 'PENDING' AND executed_by IS NULL AND executed_at IS NULL)
    OR (status != 'PENDING')
  );
