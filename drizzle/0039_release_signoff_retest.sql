-- 21.3 Release / Milestone Management
CREATE TYPE "public"."release_status" AS ENUM('PLANNING', 'IN_PROGRESS', 'READY', 'RELEASED');

CREATE TABLE "release" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "version" text,
    "description" text,
    "status" "release_status" DEFAULT 'PLANNING' NOT NULL,
    "target_date" timestamp,
    "release_date" timestamp,
    "created_by" text NOT NULL REFERENCES "user"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "release_project_idx" ON "release" ("project_id");

-- Link test_plan and test_run to release
ALTER TABLE "test_plan" ADD COLUMN "release_id" integer REFERENCES "release"("id") ON DELETE SET NULL;
ALTER TABLE "test_run" ADD COLUMN "release_id" integer REFERENCES "release"("id") ON DELETE SET NULL;

-- 21.4 Sign-off / Go-No-Go Workflow
CREATE TYPE "public"."signoff_decision" AS ENUM('APPROVED', 'REJECTED');

CREATE TABLE "test_plan_signoff" (
    "id" serial PRIMARY KEY NOT NULL,
    "test_plan_id" integer NOT NULL REFERENCES "test_plan"("id") ON DELETE CASCADE,
    "user_id" text NOT NULL REFERENCES "user"("id"),
    "decision" "signoff_decision" NOT NULL,
    "comment" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "test_plan_signoff_plan_idx" ON "test_plan_signoff" ("test_plan_id");

-- Project setting: require sign-off before completing test plans
ALTER TABLE "project" ADD COLUMN "require_signoff" boolean DEFAULT false NOT NULL;

-- 21.5 Retest on Defect Fix
ALTER TABLE "test_case" ADD COLUMN "retest_needed" boolean DEFAULT false NOT NULL;
CREATE INDEX "test_case_retest_needed_idx" ON "test_case" ("project_id", "retest_needed") WHERE "retest_needed" = true;
