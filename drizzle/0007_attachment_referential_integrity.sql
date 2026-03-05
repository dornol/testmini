-- 0007_attachment_referential_integrity.sql
-- Add database-level referential integrity for the polymorphic attachment table
-- using trigger-based validation (since standard FK constraints cannot reference
-- multiple tables conditionally).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trigger function: validate referential integrity on INSERT/UPDATE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION attachment_check_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_type = 'TESTCASE' THEN
    IF NOT EXISTS (SELECT 1 FROM test_case WHERE id = NEW.reference_id) THEN
      RAISE EXCEPTION
        'attachment.reference_id=% does not exist in test_case (reference_type=TESTCASE)',
        NEW.reference_id;
    END IF;

  ELSIF NEW.reference_type = 'EXECUTION' THEN
    IF NOT EXISTS (SELECT 1 FROM test_execution WHERE id = NEW.reference_id) THEN
      RAISE EXCEPTION
        'attachment.reference_id=% does not exist in test_execution (reference_type=EXECUTION)',
        NEW.reference_id;
    END IF;

  ELSIF NEW.reference_type = 'FAILURE' THEN
    IF NOT EXISTS (SELECT 1 FROM test_failure_detail WHERE id = NEW.reference_id) THEN
      RAISE EXCEPTION
        'attachment.reference_id=% does not exist in test_failure_detail (reference_type=FAILURE)',
        NEW.reference_id;
    END IF;

  ELSE
    RAISE EXCEPTION
      'attachment.reference_type=% is not a recognised value',
      NEW.reference_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger: fire the validation before every INSERT or UPDATE on attachment
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS attachment_check_reference_trigger ON attachment;

CREATE TRIGGER attachment_check_reference_trigger
  BEFORE INSERT OR UPDATE ON attachment
  FOR EACH ROW
  EXECUTE FUNCTION attachment_check_reference();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CASCADE-like cleanup: delete attachments when a referenced row is deleted
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Cleanup function for test_case deletions
CREATE OR REPLACE FUNCTION attachment_cascade_delete_testcase()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM attachment
  WHERE reference_type = 'TESTCASE'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attachment_cascade_delete_testcase_trigger ON test_case;

CREATE TRIGGER attachment_cascade_delete_testcase_trigger
  AFTER DELETE ON test_case
  FOR EACH ROW
  EXECUTE FUNCTION attachment_cascade_delete_testcase();

-- 3b. Cleanup function for test_execution deletions
CREATE OR REPLACE FUNCTION attachment_cascade_delete_execution()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM attachment
  WHERE reference_type = 'EXECUTION'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attachment_cascade_delete_execution_trigger ON test_execution;

CREATE TRIGGER attachment_cascade_delete_execution_trigger
  AFTER DELETE ON test_execution
  FOR EACH ROW
  EXECUTE FUNCTION attachment_cascade_delete_execution();

-- 3c. Cleanup function for test_failure_detail deletions
CREATE OR REPLACE FUNCTION attachment_cascade_delete_failure()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM attachment
  WHERE reference_type = 'FAILURE'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attachment_cascade_delete_failure_trigger ON test_failure_detail;

CREATE TRIGGER attachment_cascade_delete_failure_trigger
  AFTER DELETE ON test_failure_detail
  FOR EACH ROW
  EXECUTE FUNCTION attachment_cascade_delete_failure();
