ALTER TABLE "test_case" ADD COLUMN "risk_impact" text;
ALTER TABLE "test_case" ADD COLUMN "risk_likelihood" text;
ALTER TABLE "test_case" ADD COLUMN "risk_level" text;
CREATE INDEX "test_case_risk_level_idx" ON "test_case" ("project_id", "risk_level");
