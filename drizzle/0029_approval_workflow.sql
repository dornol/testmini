ALTER TABLE test_case ADD COLUMN approval_status varchar(20) DEFAULT 'DRAFT' NOT NULL;

CREATE TABLE approval_history (
  id serial PRIMARY KEY,
  test_case_id integer NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id),
  comment text,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX approval_history_test_case_idx ON approval_history(test_case_id);
CREATE INDEX approval_history_created_idx ON approval_history(test_case_id, created_at);
