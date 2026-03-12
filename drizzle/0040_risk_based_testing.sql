ALTER TABLE "test_case" ADD COLUMN IF NOT EXISTS "risk_impact" text;
ALTER TABLE "test_case" ADD COLUMN IF NOT EXISTS "risk_likelihood" text;
ALTER TABLE "test_case" ADD COLUMN IF NOT EXISTS "risk_level" text;
CREATE INDEX IF NOT EXISTS "test_case_risk_level_idx" ON "test_case" ("project_id", "risk_level");
