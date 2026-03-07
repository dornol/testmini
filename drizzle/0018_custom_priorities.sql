-- Change priority columns from enum to text
ALTER TABLE test_case_version ALTER COLUMN priority TYPE text;
ALTER TABLE test_case_template ALTER COLUMN priority TYPE text;

-- Create priority_config table
CREATE TABLE priority_config (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT priority_config_project_name_unique UNIQUE(project_id, name)
);

CREATE INDEX priority_config_project_idx ON priority_config(project_id);

-- Seed default priorities for all existing projects
INSERT INTO priority_config (project_id, name, color, position, is_default, created_by)
SELECT p.id, 'LOW', '#6b7280', 0, false, p.created_by FROM project p
UNION ALL
SELECT p.id, 'MEDIUM', '#3b82f6', 1, true, p.created_by FROM project p
UNION ALL
SELECT p.id, 'HIGH', '#f97316', 2, false, p.created_by FROM project p
UNION ALL
SELECT p.id, 'CRITICAL', '#ef4444', 3, false, p.created_by FROM project p;
