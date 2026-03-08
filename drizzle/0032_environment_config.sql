-- Change environment column from enum to text
ALTER TABLE test_run ALTER COLUMN environment TYPE text;

-- Create environment_config table
CREATE TABLE environment_config (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT environment_config_project_name_unique UNIQUE(project_id, name)
);

CREATE INDEX environment_config_project_idx ON environment_config(project_id);

-- Seed default environments for all existing projects
INSERT INTO environment_config (project_id, name, color, position, is_default, created_by)
SELECT p.id, 'DEV', '#3b82f6', 0, true, p.created_by FROM project p
UNION ALL
SELECT p.id, 'QA', '#8b5cf6', 1, false, p.created_by FROM project p
UNION ALL
SELECT p.id, 'STAGE', '#f97316', 2, false, p.created_by FROM project p
UNION ALL
SELECT p.id, 'PROD', '#ef4444', 3, false, p.created_by FROM project p;
