-- Team role enum
CREATE TYPE "public"."team_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');

-- Team table
CREATE TABLE "team" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "created_by" text NOT NULL REFERENCES "user"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Team Member table
CREATE TABLE "team_member" (
    "id" serial PRIMARY KEY NOT NULL,
    "team_id" integer NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "role" "team_role" NOT NULL,
    "joined_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "team_member_unique" UNIQUE("team_id", "user_id")
);
CREATE INDEX "team_member_team_idx" ON "team_member" ("team_id");

-- Add team_id FK to project
ALTER TABLE "project" ADD COLUMN "team_id" integer REFERENCES "team"("id") ON DELETE SET NULL;
CREATE INDEX "project_team_idx" ON "project" ("team_id");
