-- 0004_index_tuning.sql
-- Milestone 12: 누락 인덱스 추가

-- 1. test_failure_detail(test_execution_id) — failures 조회 (test-runs, failures API)
CREATE INDEX IF NOT EXISTS "test_failure_detail_execution_idx"
  ON "test_failure_detail" ("test_execution_id");

-- 2. test_execution(test_case_version_id) — test-cases executionMap 조회
CREATE INDEX IF NOT EXISTS "test_execution_version_idx"
  ON "test_execution" ("test_case_version_id");

-- 3. test_run(project_id, status) — 대시보드/리포트 완료 런 필터
CREATE INDEX IF NOT EXISTS "test_run_project_status_idx"
  ON "test_run" ("project_id", "status");

-- 4. test_run(project_id, created_at) — 런 목록 정렬
CREATE INDEX IF NOT EXISTS "test_run_project_created_idx"
  ON "test_run" ("project_id", "created_at");

-- 5. test_execution(executed_at) — 대시보드 최근 활동
CREATE INDEX IF NOT EXISTS "test_execution_executed_at_idx"
  ON "test_execution" ("executed_at");
