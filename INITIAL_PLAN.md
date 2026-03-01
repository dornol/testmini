# QA Management System (Internal TMS)

## 1. Overview

Internal QA management system for handling test cases and execution
results per project.

Goals: - Project isolation - Test case versioning - Release-based test
runs - Detailed failure tracking - File attachments - Multi-user
collaboration - Conflict prevention (Soft Lock + Optimistic Lock) -
Real-time execution sync (WebSocket)

Automation integration will be introduced in Phase 2.

------------------------------------------------------------------------

## 2. Tech Stack

### Frontend + Backend (Monolith)

-   Svelte
-   SvelteKit
-   TypeScript

### Database

-   PostgreSQL

### Cache / Lock / PubSub

-   Redis (Soft Lock, Pub/Sub, Session store)

### File Storage

-   S3-compatible storage (MinIO)

### Real-time

-   WebSocket (Run screen synchronization)

------------------------------------------------------------------------

## 3. Architecture

Svelte UI │ SvelteKit (SSR + API + WS) │ PostgreSQL Redis MinIO

-   Single monolithic service
-   API + SSR integrated
-   Redis-based locking and event broadcasting
-   Docker single service deployment

------------------------------------------------------------------------

## 4. Authentication

### Login Types

-   Local account (ID / Password)
-   Multiple OIDC providers

### Session Strategy

-   httpOnly cookie session
-   Redis session storage

### Core Tables

User - id - email - name - status - created_at

UserAuth - id - user_id - provider_type (LOCAL / OIDC) - provider_name -
provider_user_id - password_hash (LOCAL only)

Session - id - user_id - expires_at

------------------------------------------------------------------------

## 5. Authorization

Global Role: - ADMIN - USER

Project Role: - PROJECT_ADMIN - QA - DEV - VIEWER

ProjectMember: - id - project_id - user_id - role

------------------------------------------------------------------------

## 6. Domain Model

### Project

-   id
-   name
-   description
-   active
-   created_at

### TestCase

-   id
-   project_id
-   key (TC-0001)
-   latest_version_id
-   created_by
-   created_at

### TestCaseVersion

-   id
-   test_case_id
-   version_no
-   title
-   precondition
-   steps (JSONB)
-   expected_result
-   priority
-   revision (optimistic lock)
-   updated_by
-   created_at

New row is created on each update. Revision field is used for optimistic
locking.

### TestRun

-   id
-   project_id
-   name (e.g., v1.2.0 QA)
-   environment (DEV / QA / STAGE / PROD)
-   started_at
-   finished_at
-   created_by

### TestExecution

-   id
-   test_run_id
-   test_case_version_id
-   status (PASS / FAIL / BLOCKED / SKIPPED)
-   executed_by
-   executed_at

### TestFailureDetail

-   id
-   test_execution_id
-   failure_environment
-   test_method
-   error_message
-   stack_trace
-   comment
-   created_by
-   created_at

### Attachment

-   id
-   reference_type (TESTCASE / EXECUTION / FAILURE)
-   reference_id
-   file_name
-   object_key
-   file_size
-   uploaded_by
-   uploaded_at

Upload flow: 1. Generate presigned URL 2. Client uploads directly 3.
Save metadata after upload

------------------------------------------------------------------------

## 7. Concurrency Strategy

### TestCase Editing

Soft Lock (Redis) Key: lock:testcase:{testCaseVersionId}

Value: userId

TTL: 10 minutes

Flow: 1. Create lock when editing starts 2. Deny editing if lock exists
3. Release on save/cancel 4. Auto-expire by TTL

Optimistic Lock: UPDATE ... WHERE id = ? AND revision = ?

If 0 rows affected → conflict detected.

### TestRun Execution Screen

-   Save execution
-   Broadcast WebSocket event
-   Update only modified row on clients
-   Use optimistic lock for integrity

------------------------------------------------------------------------

## 8. WebSocket Design

Endpoint: /ws/run/{runId}

Event Example: { "type": "EXECUTION_UPDATED", "executionId": 123,
"status": "FAIL", "updatedBy": "user1", "updatedAt":
"2026-03-01T10:22:33" }

Redis Pub/Sub used for multi-instance scalability.

------------------------------------------------------------------------

## 9. Key Screens

-   Project list & management
-   Test case list (filter + search + latest status)
-   Test case detail + version history
-   Run execution screen (bulk pass, fail modal, real-time stats)
-   Dashboard (pass rate, failure rate, execution metrics)

------------------------------------------------------------------------

## 10. Performance Considerations

-   Mandatory server-side pagination
-   Indexes:
    -   test_case(project_id)
    -   test_case_version(test_case_id, version_no DESC)
    -   test_execution(test_run_id, status)
-   Virtual scrolling for run screen
-   GIN index for JSONB if needed

------------------------------------------------------------------------

## 11. Development Phases

Phase 1 (MVP) - Auth - Project - TestCase + Version - TestRun -
Execution - Failure details - File upload

Phase 2 - Redis Soft Lock - WebSocket real-time sync - Basic dashboard

Phase 3 - Advanced search - Performance optimization

Phase 4 (Automation) - automation_key field - Automation result API - CI
integration

------------------------------------------------------------------------

## 12. Future Extensions

-   CI integration
-   Failure trend analytics
-   Slack notifications
-   Flaky test detection
-   Project templates
