-- Test Plan status enum
CREATE TYPE "public"."test_plan_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- Test Plan table
CREATE TABLE "test_plan" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "status" "test_plan_status" DEFAULT 'DRAFT' NOT NULL,
    "milestone" text,
    "start_date" timestamp,
    "end_date" timestamp,
    "created_by" text NOT NULL REFERENCES "user"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "test_plan_project_idx" ON "test_plan" ("project_id");

-- Test Plan <-> Test Case join table
CREATE TABLE "test_plan_test_case" (
    "id" serial PRIMARY KEY NOT NULL,
    "test_plan_id" integer NOT NULL REFERENCES "test_plan"("id") ON DELETE CASCADE,
    "test_case_id" integer NOT NULL REFERENCES "test_case"("id") ON DELETE CASCADE,
    "position" integer NOT NULL DEFAULT 0,
    "added_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "test_plan_test_case_unique" UNIQUE("test_plan_id", "test_case_id")
);
CREATE INDEX "test_plan_test_case_plan_idx" ON "test_plan_test_case" ("test_plan_id");

-- Add test_plan_id FK to test_run
ALTER TABLE "test_run" ADD COLUMN "test_plan_id" integer REFERENCES "test_plan"("id") ON DELETE SET NULL;
