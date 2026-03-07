-- Add updatedAt columns to project and test_run tables
ALTER TABLE "project" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "test_run" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
