-- Full-text search: tsvector column on test_case_version
ALTER TABLE test_case_version ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
-- Steps are stored as jsonb array; extract text by casting to text and stripping JSON syntax
UPDATE test_case_version SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(precondition, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(expected_result, '')), 'B') ||
  setweight(to_tsvector('english', regexp_replace(coalesce(steps::text, ''), '[^a-zA-Z0-9\s]', ' ', 'g')), 'C');

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS test_case_version_search_idx
  ON test_case_version USING gin(search_vector);

-- Trigger to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_test_case_version_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.precondition, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.expected_result, '')), 'B') ||
    setweight(to_tsvector('english', regexp_replace(coalesce(NEW.steps::text, ''), '[^a-zA-Z0-9\s]', ' ', 'g')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_test_case_version_search ON test_case_version;
CREATE TRIGGER trg_test_case_version_search
  BEFORE INSERT OR UPDATE OF title, precondition, steps, expected_result
  ON test_case_version
  FOR EACH ROW
  EXECUTE FUNCTION update_test_case_version_search_vector();

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS test_case_latest_version_idx ON test_case(latest_version_id);
CREATE INDEX IF NOT EXISTS test_case_version_priority_idx ON test_case_version(priority);
CREATE INDEX IF NOT EXISTS test_execution_run_status_idx ON test_execution(test_run_id, status);
