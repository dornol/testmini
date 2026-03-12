-- Add detail fields to environment_config for QA test info
ALTER TABLE environment_config ADD COLUMN IF NOT EXISTS base_url text;
ALTER TABLE environment_config ADD COLUMN IF NOT EXISTS credentials text;
ALTER TABLE environment_config ADD COLUMN IF NOT EXISTS memo text;
