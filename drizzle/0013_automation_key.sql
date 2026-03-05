-- Add automationKey to test_case table
ALTER TABLE "test_case" ADD COLUMN "automation_key" text;

-- Unique index per project where automation_key is not null
CREATE UNIQUE INDEX "test_case_automation_key_unique" ON "test_case" ("project_id", "automation_key") WHERE "automation_key" IS NOT NULL;

-- General index for lookups
CREATE INDEX "test_case_automation_key_idx" ON "test_case" ("project_id", "automation_key");
