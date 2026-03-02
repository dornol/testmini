CREATE TABLE test_suite (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT test_suite_project_name_unique UNIQUE (project_id, name)
);
CREATE INDEX test_suite_project_idx ON test_suite(project_id);

CREATE TABLE test_suite_item (
  id SERIAL PRIMARY KEY,
  suite_id INTEGER NOT NULL REFERENCES test_suite(id) ON DELETE CASCADE,
  test_case_id INTEGER NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT test_suite_item_unique UNIQUE (suite_id, test_case_id)
);
CREATE INDEX test_suite_item_suite_idx ON test_suite_item(suite_id);
