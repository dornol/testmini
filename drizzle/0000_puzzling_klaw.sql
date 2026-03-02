CREATE TYPE "public"."environment" AS ENUM('DEV', 'QA', 'STAGE', 'PROD');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."global_role" AS ENUM('ADMIN', 'USER');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."project_role" AS ENUM('PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."reference_type" AS ENUM('TESTCASE', 'EXECUTION', 'FAILURE');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('CREATED', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_type" "reference_type" NOT NULL,
	"reference_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"object_key" text NOT NULL,
	"file_size" integer,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" "project_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_member_unique" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_project_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "test_case" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"key" text NOT NULL,
	"latest_version_id" integer,
	"group_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_case_key_unique" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "test_case_assignee" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_case_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_case_assignee_unique" UNIQUE("test_case_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "test_case_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"color" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_case_group_project_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "test_case_tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_case_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_case_tag_unique" UNIQUE("test_case_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "test_case_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_case_id" integer NOT NULL,
	"version_no" integer NOT NULL,
	"title" text NOT NULL,
	"precondition" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_result" text,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_case_version_unique" UNIQUE("test_case_id","version_no")
);
--> statement-breakpoint
CREATE TABLE "test_execution" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_run_id" integer NOT NULL,
	"test_case_version_id" integer NOT NULL,
	"status" "execution_status" DEFAULT 'PENDING' NOT NULL,
	"comment" text,
	"executed_by" text,
	"executed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "test_failure_detail" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_execution_id" integer NOT NULL,
	"failure_environment" text,
	"test_method" text,
	"error_message" text,
	"stack_trace" text,
	"comment" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "run_status" DEFAULT 'CREATED' NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_group_id_test_case_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."test_case_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case" ADD CONSTRAINT "test_case_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_assignee" ADD CONSTRAINT "test_case_assignee_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_assignee" ADD CONSTRAINT "test_case_assignee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_group" ADD CONSTRAINT "test_case_group_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_group" ADD CONSTRAINT "test_case_group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_tag" ADD CONSTRAINT "test_case_tag_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_tag" ADD CONSTRAINT "test_case_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_version" ADD CONSTRAINT "test_case_version_test_case_id_test_case_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_version" ADD CONSTRAINT "test_case_version_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_execution" ADD CONSTRAINT "test_execution_test_run_id_test_run_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."test_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_execution" ADD CONSTRAINT "test_execution_test_case_version_id_test_case_version_id_fk" FOREIGN KEY ("test_case_version_id") REFERENCES "public"."test_case_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_execution" ADD CONSTRAINT "test_execution_executed_by_user_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_failure_detail" ADD CONSTRAINT "test_failure_detail_test_execution_id_test_execution_id_fk" FOREIGN KEY ("test_execution_id") REFERENCES "public"."test_execution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_failure_detail" ADD CONSTRAINT "test_failure_detail_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run" ADD CONSTRAINT "test_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run" ADD CONSTRAINT "test_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_ref_idx" ON "attachment" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "project_member_project_idx" ON "project_member" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tag_project_idx" ON "tag" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "test_case_project_idx" ON "test_case" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "test_case_group_sort_idx" ON "test_case" USING btree ("project_id","group_id","sort_order");--> statement-breakpoint
CREATE INDEX "test_case_assignee_case_idx" ON "test_case_assignee" USING btree ("test_case_id");--> statement-breakpoint
CREATE INDEX "test_case_assignee_user_idx" ON "test_case_assignee" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "test_case_group_project_idx" ON "test_case_group" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "test_case_tag_case_idx" ON "test_case_tag" USING btree ("test_case_id");--> statement-breakpoint
CREATE INDEX "test_case_tag_tag_idx" ON "test_case_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "test_case_version_case_idx" ON "test_case_version" USING btree ("test_case_id","version_no");--> statement-breakpoint
CREATE INDEX "test_execution_run_status_idx" ON "test_execution" USING btree ("test_run_id","status");--> statement-breakpoint
CREATE INDEX "test_run_project_idx" ON "test_run" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");