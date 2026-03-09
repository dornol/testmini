# API Reference

This document is the authoritative reference for all HTTP API endpoints exposed by this SvelteKit application. All endpoints are prefixed with `/api`.

---

## Table of Contents

1. [Authentication](#authentication)
   - [Session-based auth](#session-based-authentication)
   - [API key auth](#api-key-authentication)
   - [Roles and permissions](#roles-and-permissions)
2. [Health](#health)
3. [Projects](#projects)
4. [Test Cases](#test-cases)
   - [CRUD](#test-case-crud)
   - [Clone](#clone-test-case)
   - [Versions (diff)](#test-case-versions)
   - [Export / Import](#test-case-export--import)
   - [Bulk operations](#bulk-operations)
   - [Reorder](#reorder-test-cases)
   - [Lock](#test-case-lock)
   - [Comments](#test-case-comments)
5. [Test Case Groups](#test-case-groups)
6. [Test Runs](#test-runs)
   - [CRUD](#test-run-crud)
   - [Clone](#clone-test-run)
   - [Executions](#executions)
   - [Execution status](#execution-status)
   - [Failure details](#failure-details)
   - [Export (CSV)](#test-run-export)
   - [Execution comments](#execution-comments)
   - [Real-time events (SSE)](#real-time-events)
7. [Test Suites](#test-suites)
8. [Reports](#reports)
9. [Attachments](#attachments)
10. [Users](#users)
11. [Admin](#admin)
12. [Notifications](#notifications)
13. [Templates](#templates)
14. [Dashboard Layout](#dashboard-layout)
15. [API Keys](#api-keys)
16. [Automation](#automation)
17. [Priority Configuration](#priority-configuration)
18. [Environment Configuration](#environment-configuration)
19. [Test Plans](#test-plans)
20. [MCP Server](#mcp-server)
21. [Webhooks](#webhooks)
22. [Issue Tracker](#issue-tracker)
23. [Issue Links](#issue-links)
24. [Requirements (Traceability)](#requirements-traceability)
25. [Saved Filters](#saved-filters)
26. [Report Export & Sharing](#report-export--sharing)
27. [Report Schedules](#report-schedules)
28. [Issue Link Status Sync](#issue-link-status-sync)
29. [Parameterized Tests](#parameterized-tests)
    - [Parameters](#test-case-parameters)
    - [Data Sets](#test-case-data-sets)
    - [Shared Data Sets](#shared-data-sets)
30. [Custom Fields](#custom-fields)
31. [Execution Comments](#execution-comments)
32. [Branding](#branding)
33. [Exploratory Sessions](#exploratory-sessions)
34. [Approval Workflow](#approval-workflow)
35. [Teams](#teams)

---

## Authentication

### Session-based Authentication

The majority of endpoints require a valid browser session established via Better Auth. Unauthenticated requests receive `401 Authentication required`. All session cookies are set by the auth routes under `/auth/**`.

`App.Locals` carries the authenticated user in `locals.user`. The helper `requireAuth(locals)` used in every route handler throws `401` when no session is present.

### API Key Authentication

The two automation endpoints (`POST /api/automation/results` and `POST /api/automation/webhook`) accept project-scoped API keys instead of a session. The key must be sent in the `Authorization` header:

```
Authorization: Bearer tmk_<key>
```

Keys are generated from the API Keys management interface (see [API Keys](#api-keys)). The raw key is shown **once** at creation time and cannot be retrieved again. Internally keys are stored as a SHA-256 hash.

### Roles and Permissions

Every project member has exactly one of the following roles. Global `admin` users bypass all project-level role checks.

| Role | Description |
|---|---|
| `PROJECT_ADMIN` | Full project control — create/delete everything, manage members and API keys |
| `QA` | Create/edit test cases, runs, suites, templates; cannot delete projects or API keys |
| `DEV` | Create/edit test cases and runs; limited write access |
| `VIEWER` | Read-only access to all project resources |

Auth helpers used throughout:

- `requireAuth(locals)` — 401 if no session
- `requireProjectAccess(user, projectId)` — 403 if user is not a project member
- `requireProjectRole(user, projectId, roles)` — 403 if user role is not in `roles`

---

## Health

### `GET /api/health`

No authentication required. Checks database connectivity.

**Response 200**
```json
{ "status": "ok" }
```

**Response 503**
```json
{ "status": "error", "message": "Database connection failed" }
```

---

## Projects

### `GET /api/projects`

List projects visible to the authenticated user. Non-admins only see projects they are a member of.

**Auth:** Session required

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number (1-based) |
| `limit` | integer | `12` | Results per page (max 50) |
| `search` | string | `""` | Filter by name (case-insensitive substring) |
| `active` | boolean | `true` | `false` returns deactivated projects |

**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "name": "My Project",
      "description": "Optional description",
      "active": true,
      "createdBy": "user-abc",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "memberCount": 4
    }
  ],
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 42,
    "totalPages": 4
  }
}
```

---

### `POST /api/projects`

Create a new project. The creator is automatically added as `PROJECT_ADMIN`.

**Auth:** Session required

**Request body**
```json
{
  "name": "My New Project",
  "description": "Optional, max 1000 chars"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | Yes | 1–100 characters |
| `description` | string | No | max 1000 characters |

**Response 201**
```json
{
  "data": {
    "id": 42,
    "name": "My New Project",
    "description": "Optional, max 1000 chars",
    "active": true,
    "createdBy": "user-abc",
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Response 400** — validation error
```json
{ "error": { "name": ["Project name is required"] } }
```

---

### `GET /api/projects/:projectId`

Get details for a single project.

**Auth:** Session + project membership

**Response 200**
```json
{
  "data": {
    "id": 1,
    "name": "My Project",
    "description": "...",
    "active": true,
    "createdBy": "user-abc",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "memberCount": 4
  }
}
```

---

### `PATCH /api/projects/:projectId`

Update project name and/or description.

**Auth:** Session + `PROJECT_ADMIN`

**Request body**
```json
{
  "name": "Renamed Project",
  "description": "Updated description"
}
```

**Response 200**
```json
{ "data": { ...updatedProject } }
```

---

### `DELETE /api/projects/:projectId`

Soft-delete a project (sets `active = false`).

**Auth:** Session + `PROJECT_ADMIN`

**Response 200**
```json
{ "data": { ...deactivatedProject } }
```

---

## Test Cases

### Test Case CRUD

#### `GET /api/projects/:projectId/test-cases/:testCaseId`

Get full test case detail including the latest version, version history summary, assigned tags, project tags, assigned users, and project member list.

**Auth:** Session required (any project member)

**Response 200**
```json
{
  "testCase": {
    "id": 10,
    "key": "TC-0001",
    "automationKey": "login_happy_path",
    "approvalStatus": "APPROVED",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "latestVersion": {
      "id": 100,
      "versionNo": 3,
      "title": "User can log in with valid credentials",
      "precondition": "User account exists and is active",
      "steps": [
        { "order": 1, "action": "Navigate to /login", "expected": "Login form is displayed" },
        { "order": 2, "action": "Enter valid email and password", "expected": "Fields accept input" },
        { "order": 3, "action": "Click Submit", "expected": "User is redirected to the dashboard" }
      ],
      "expectedResult": "User is authenticated and lands on /dashboard",
      "priority": "HIGH",
      "stepFormat": "STEPS",
      "revision": 3
    }
  },
  "versions": [
    { "id": 100, "versionNo": 3, "title": "...", "priority": "HIGH", "updatedBy": "Alice", "createdAt": "..." }
  ],
  "assignedTags": [{ "id": 5, "name": "smoke", "color": "#22c55e" }],
  "projectTags": [{ "id": 5, "name": "smoke", "color": "#22c55e" }],
  "assignedAssignees": [{ "userId": "u-1", "userName": "Alice", "userImage": null }],
  "projectMembers": [{ "userId": "u-1", "userName": "Alice", "userImage": null }]
}
```

---

#### `PATCH /api/projects/:projectId/test-cases/:testCaseId`

Partial update of a test case. Updating `title` or `priority` creates a new version to preserve history. Updating `key` or `automationKey` modifies the test case record directly (no new version).

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body** (all fields optional)
```json
{
  "key": "TC-0099",
  "title": "New title",
  "priority": "CRITICAL",
  "automationKey": "my_test_key"
}
```

| Field | Type | Description |
|---|---|---|
| `key` | string | Must be unique within the project |
| `title` | string | Creates a new version |
| `priority` | `string` (project-configured priority name, e.g. `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) | Creates a new version |
| `automationKey` | `string \| null` | Must be unique within the project |

**Response 200**
```json
{ "success": true }
```

**Response 409** — key/automationKey conflict
```json
{ "error": "Key already exists in this project" }
```

---

#### `PUT /api/projects/:projectId/test-cases/:testCaseId`

Full update of test case content (title, precondition, steps, expectedResult, priority). Always creates a new version. Implements optimistic concurrency via `revision` field — submit the `revision` number from the latest version you read, and the server rejects the write if another user has since modified the test case.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "title": "User can log in with valid credentials",
  "precondition": "User account exists and is active",
  "steps": [
    { "action": "Navigate to /login", "expected": "Login form is displayed" },
    { "action": "Click Submit", "expected": "User is redirected" }
  ],
  "expectedResult": "User is on the dashboard",
  "priority": "HIGH",
  "revision": 3
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | 1–200 characters |
| `precondition` | string | No | Free text |
| `steps` | array | No | Array of `{ action, expected }` objects |
| `expectedResult` | string | No | Free text |
| `priority` | string | Yes | Project-configured priority name (e.g. `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) |
| `stepFormat` | string | No | `STEPS` (default) or `GHERKIN`. When `GHERKIN`, steps use BDD Given/When/Then keywords prepended to the action field. |
| `revision` | integer | Yes | Current revision number for optimistic locking |

**Response 200**
```json
{ "success": true }
```

**Response 409** — concurrent edit conflict
```json
{ "error": "This test case has been modified by another user. Please refresh and try again." }
```

---

#### `DELETE /api/projects/:projectId/test-cases/:testCaseId`

Permanently delete a test case.

**Auth:** Session + `PROJECT_ADMIN`

**Response 200**
```json
{ "success": true }
```

---

### Clone Test Case

#### `POST /api/projects/:projectId/test-cases/:testCaseId/clone`

Clone a single test case. Creates a new test case with a sequential key (e.g. `TC-0042`), copies the latest version content and all tags. The clone is placed in the same group as the original.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body:** None

**Response 200**
```json
{
  "success": true,
  "newTestCaseId": 99,
  "newKey": "TC-0042"
}
```

---

### Test Case Versions

#### `GET /api/projects/:projectId/test-cases/:testCaseId/versions`

Compare two specific versions of a test case side-by-side.

**Auth:** Session + any project membership

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `v1` | integer | Yes | First version number |
| `v2` | integer | Yes | Second version number (must differ from v1) |

**Response 200**
```json
{
  "v1": {
    "id": 50,
    "versionNo": 1,
    "title": "Old title",
    "precondition": "...",
    "steps": [...],
    "expectedResult": "...",
    "priority": "MEDIUM",
    "updatedBy": "Alice",
    "createdAt": "2025-01-10T00:00:00.000Z"
  },
  "v2": {
    "id": 100,
    "versionNo": 3,
    "title": "New title",
    ...
  }
}
```

**Response 400** — if v1 equals v2, or either is not a number

---

### Test Case Export / Import

#### `GET /api/projects/:projectId/test-cases/export`

Download all test cases for a project as CSV or JSON.

**Auth:** Session + any project membership

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `format` | `csv \| json` | `csv` | Output format |

**Response (CSV)** — `Content-Type: text/csv; charset=utf-8`

Columns: `Key, Title, Priority, Precondition, Steps, Expected Result, Tags, Group`

Steps are JSON-encoded in the CSV cell. Tags are semicolon-separated. A UTF-8 BOM is prepended for Excel compatibility.

**Response (JSON)** — `Content-Type: application/json`
```json
{
  "testCases": [
    {
      "key": "TC-0001",
      "title": "Login test",
      "priority": "HIGH",
      "precondition": "User exists",
      "steps": [{ "order": 1, "action": "...", "expected": "..." }],
      "expectedResult": "...",
      "tags": ["smoke", "regression"],
      "group": "Authentication"
    }
  ]
}
```

---

#### `POST /api/projects/:projectId/test-cases/import`

Import test cases from a CSV or JSON file. Groups and tags are matched by name (case-insensitive). Unrecognised tags are silently ignored (the tag must already exist in the project). Rows with missing titles are skipped.

**Auth:** Session + `PROJECT_ADMIN | QA`

**Request body:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | `.csv` or `.json` file |

**CSV format** — must have a header row with: `Key, Title, Priority, Precondition, Steps, Expected Result, Tags, Group`
The `Steps` column must contain a JSON-encoded array.

**JSON format** — either a root array or `{ "testCases": [...] }`. Each element accepts the same fields as the CSV columns (camelCase or title-case).

**Response 200**
```json
{
  "imported": 5,
  "errors": ["Row 3: Missing title, skipped"],
  "rows": [
    { "row": 1, "status": "success", "title": "Login test", "key": "TC-0042" },
    { "row": 3, "status": "skipped", "title": "", "error": "Missing title" }
  ]
}
```

---

### Bulk Operations

#### `POST /api/projects/:projectId/test-cases/bulk`

Apply an operation to multiple test cases at once (max 200 per request).

**Auth:** Session + `PROJECT_ADMIN | QA | DEV` (delete requires `PROJECT_ADMIN`)

**Request body**
```json
{
  "action": "addTag",
  "testCaseIds": [1, 2, 3],
  "tagId": 5,
  "priority": "HIGH",
  "groupId": 10,
  "userId": "user-abc"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | enum | Yes | See table below |
| `testCaseIds` | integer[] | Yes | IDs of target test cases |
| `tagId` | integer | Conditional | Required for `addTag`, `removeTag` |
| `priority` | string | Conditional | Required for `setPriority` |
| `groupId` | integer\|null | Conditional | Required for `moveToGroup`; `null` moves to ungrouped |
| `userId` | string | Conditional | Required for `addAssignee`, `removeAssignee` |

**Actions**

| Action | Description | Extra auth |
|---|---|---|
| `addTag` | Add a tag to all selected test cases | QA+ |
| `removeTag` | Remove a tag from all selected test cases | QA+ |
| `setPriority` | Update priority (creates new versions) | QA+ |
| `moveToGroup` | Move test cases to a group (or ungrouped if `groupId` is null) | QA+ |
| `delete` | Permanently delete all selected test cases | PROJECT_ADMIN only |
| `clone` | Clone all selected test cases | QA+ |
| `addAssignee` | Assign a project member to all selected test cases | QA+ |
| `removeAssignee` | Remove an assignee from all selected test cases | QA+ |

**Response 200**
```json
{ "success": true, "affected": 3 }
```

---

### Reorder Test Cases

#### `PUT /api/projects/:projectId/test-cases/reorder`

Update `sortOrder` and/or `groupId` for multiple test cases in one transaction.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "items": [
    { "id": 1, "groupId": 10, "sortOrder": 1000 },
    { "id": 2, "groupId": 10, "sortOrder": 2000 },
    { "id": 3, "groupId": null, "sortOrder": 3000 }
  ]
}
```

`sortOrder` must be a non-negative integer. `groupId` can be `null` for ungrouped.

**Response 200**
```json
{ "success": true }
```

---

### Test Case Lock

Collaborative editing is protected by an optimistic distributed lock (Redis-backed when available, in-memory fallback for single-server deployments). A lock expires automatically after an idle period (the server refreshes it while editing).

#### `GET /api/projects/:projectId/test-cases/:testCaseId/lock`

Check current lock status.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Response 200**
```json
{
  "locked": true,
  "holder": { "userId": "u-1", "userName": "Alice" }
}
```

When `locked` is `false`, `holder` is `null`.

---

#### `POST /api/projects/:projectId/test-cases/:testCaseId/lock`

Acquire the lock before editing.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body:** None

**Response 200** — lock acquired
```json
{ "acquired": true }
```

**Response 409** — lock held by another user
```json
{ "acquired": false, "holder": { "userId": "u-2", "userName": "Bob" } }
```

---

#### `PUT /api/projects/:projectId/test-cases/:testCaseId/lock`

Refresh (extend) the lock TTL while editing is still in progress.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Response 200**
```json
{ "refreshed": true }
```

**Response 409** — lock no longer held by this user
```json
{ "refreshed": false }
```

---

#### `DELETE /api/projects/:projectId/test-cases/:testCaseId/lock`

Release the lock after saving or cancelling.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Response 200**
```json
{ "released": true }
```

---

### Test Case Comments

#### `GET /api/projects/:projectId/test-cases/:testCaseId/comments`

List all comments for a test case (flat list; threads implied by `parentId`).

**Auth:** Session required

**Response 200** — array of comment objects
```json
[
  {
    "id": 1,
    "testCaseId": 10,
    "userId": "u-1",
    "content": "This step needs clarification.",
    "parentId": null,
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T10:00:00.000Z",
    "userName": "Alice",
    "userEmail": "alice@example.com",
    "userImage": null
  }
]
```

---

#### `POST /api/projects/:projectId/test-cases/:testCaseId/comments`

Post a new comment or reply to an existing comment.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "content": "Needs more detail on step 2.",
  "parentId": null
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | Yes | 1–10 000 characters |
| `parentId` | integer\|null | No | ID of a top-level comment to reply to |

**Response 201** — created comment with user info

**Side effects:**
- Sends `COMMENT_ADDED` notification to test case assignees (excluding the comment author)
- Parses `@name` mentions in content and sends `MENTION` notification to matching project members
- If SMTP is configured, also sends email notifications

---

#### `PATCH /api/projects/:projectId/test-cases/:testCaseId/comments/:commentId`

Edit a comment. Only the comment author or a global admin may edit.

**Auth:** Session (author or global admin)

**Request body**
```json
{ "content": "Updated text." }
```

**Response 200** — updated comment

---

#### `DELETE /api/projects/:projectId/test-cases/:testCaseId/comments/:commentId`

Delete a comment. Allowed for: comment author, `PROJECT_ADMIN` members, global admins.

**Auth:** Session (author, PROJECT_ADMIN, or global admin)

**Response 200**
```json
{ "success": true }
```

---

## Test Case Groups

### `GET /api/projects/:projectId/test-case-groups`

List all groups for a project, ordered by `sortOrder`, including each group's test case count.

**Auth:** Session required

**Response 200**
```json
[
  {
    "id": 10,
    "name": "Authentication",
    "sortOrder": 1000,
    "color": "#3b82f6",
    "testCaseCount": 12
  }
]
```

---

### `POST /api/projects/:projectId/test-case-groups`

Create a new test case group.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "name": "Authentication",
  "color": "#3b82f6"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Must be unique within the project |
| `color` | string | No | Valid CSS hex color (`#RGB` or `#RRGGBB`) |

**Response 201** — created group

**Response 409** — name already exists

---

### `PATCH /api/projects/:projectId/test-case-groups/:groupId`

Update group name and/or color.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "name": "New Name",
  "color": "#ef4444"
}
```

**Response 200** — updated group

---

### `DELETE /api/projects/:projectId/test-case-groups/:groupId`

Delete a group. Test cases in the group are moved to ungrouped (via `groupId = NULL` foreign key behavior).

**Auth:** Session + `PROJECT_ADMIN`

**Response 200**
```json
{ "success": true }
```

---

### `PUT /api/projects/:projectId/test-case-groups/reorder`

Update `sortOrder` for multiple groups in one transaction.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "groups": [
    { "id": 10, "sortOrder": 1000 },
    { "id": 11, "sortOrder": 2000 }
  ]
}
```

**Response 200**
```json
{ "success": true }
```

---

## Test Runs

### Test Run CRUD

Test runs are created through a form action at `POST /projects/:projectId/test-runs/new` (SvelteKit form action, not a REST endpoint). After creation the run is at status `CREATED`.

#### `PATCH /api/projects/:projectId/test-runs/:runId`

Update the name and/or environment of a test run. Only allowed while the run is in `CREATED` status.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "name": "Regression Sprint 5",
  "environment": "STAGE"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | No | 1–200 characters |
| `environment` | enum | No | `DEV \| QA \| STAGE \| PROD` |

**Response 200**
```json
{ "success": true }
```

**Response 409** — run is not in `CREATED` status
```json
{ "error": "Only CREATED runs can be edited" }
```

---

#### `DELETE /api/projects/:projectId/test-runs/:runId`

Permanently delete a test run and all its executions (cascade).

**Auth:** Session + `PROJECT_ADMIN`

**Response 200**
```json
{ "success": true }
```

---

### Clone Test Run

#### `POST /api/projects/:projectId/test-runs/:runId/clone`

Clone a test run. The clone uses the latest version of every test case that was in the original run. All execution statuses are reset to `PENDING`.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body** (optional)
```json
{ "name": "Copy of Sprint 5" }
```

If `name` is omitted, the clone is named `"Copy of <original name>"`.

**Response 200**
```json
{ "id": 99 }
```

---

### Executions

#### `POST /api/projects/:projectId/test-runs/:runId/executions`

Add a single test case to an existing test run.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{ "testCaseId": 10 }
```

**Response 200**
```json
{ "executionId": 200, "status": "PENDING" }
```

**Response 409** — test case is already in the run

---

### Execution Status

#### `PUT /api/projects/:projectId/test-runs/:runId/executions/:executionId/status`

Record the result of an execution. Automatically transitions the run from `CREATED` to `IN_PROGRESS` on the first non-`PENDING` result. Publishes a real-time event (via Redis pub/sub or in-memory bus) so other users viewing the run see the update immediately.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{ "status": "PASS" }
```

Valid statuses: `PASS | FAIL | BLOCKED | SKIPPED | PENDING`

**Response 200**
```json
{ "success": true, "status": "PASS" }
```

**Response 403** — run is `COMPLETED`

---

### Failure Details

#### `GET /api/projects/:projectId/test-runs/:runId/executions/:executionId/failures`

List all failure details recorded for an execution.

**Auth:** Session + any project membership (`PROJECT_ADMIN | QA | DEV | VIEWER`)

**Response 200**
```json
{
  "failures": [
    {
      "id": 1,
      "errorMessage": "NullPointerException in UserService.login",
      "testMethod": "UserServiceTest#testLogin",
      "failureEnvironment": "QA",
      "stackTrace": "java.lang.NullPointerException\n  at ...",
      "comment": "Intermittent — may be race condition",
      "createdBy": "u-1",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "createdByName": "Alice"
    }
  ]
}
```

---

#### `POST /api/projects/:projectId/test-runs/:runId/executions/:executionId/failures`

Record a failure detail. Also sets the execution status to `FAIL`.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "errorMessage": "NullPointerException in UserService.login",
  "testMethod": "UserServiceTest#testLogin",
  "failureEnvironment": "QA",
  "stackTrace": "java.lang.NullPointerException\n  at ...",
  "comment": "Intermittent"
}
```

| Field | Type | Max length |
|---|---|---|
| `errorMessage` | string | 2000 |
| `testMethod` | string | 500 |
| `failureEnvironment` | string | 200 |
| `stackTrace` | string | 10 000 |
| `comment` | string | 2000 |

All fields are optional (but at least one is expected in practice).

**Response 200**
```json
{ "success": true }
```

---

### Test Run Export

#### `GET /api/projects/:projectId/test-runs/:runId/export`

Stream a CSV export of all executions in a single run.

**Auth:** Session + any project membership

**Response** — `Content-Type: text/csv; charset=utf-8`

CSV columns: `Test Case Key, Title, Priority, Version, Status, Executed By, Executed At, Comment, Error Message`

The response is streamed in batches of 100 rows to avoid memory pressure on large runs.

---

#### `GET /api/projects/:projectId/reports/export`

Export executions across multiple runs in a single CSV file (multi-run comparison).

**Auth:** Session + any project membership

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `runs` | string | Yes | Comma-separated run IDs, e.g. `1,2,3` (max 20) |

**Response** — `Content-Type: text/csv; charset=utf-8`, filename `multi_run_export.csv`

CSV columns: `Key, Title, Priority, Run Name, Environment, Status, Executed By, Executed At, Comment, Error Message`

---

### Real-time Events

#### `GET /api/projects/:projectId/test-runs/:runId/events`

Subscribe to real-time updates for a test run using Server-Sent Events (SSE). Backed by Redis pub/sub when available, or an in-memory event bus for single-server deployments. The connection sends a keepalive comment every 30 seconds.

**Auth:** Session + any project membership

**Response** — `Content-Type: text/event-stream`

**Event types received:**

On connect:
```
data: {"type":"connected"}
```

On execution status change:
```
data: {"type":"execution:updated","executionId":200,"status":"PASS","executedBy":"Alice"}
```

The client should close the connection when leaving the run detail page.

---

## Test Suites

Test suites are named, reusable collections of test cases.

### `GET /api/projects/:projectId/test-suites`

List all test suites for a project.

**Auth:** Session + any project membership

**Response 200**
```json
[
  {
    "id": 1,
    "name": "Smoke Suite",
    "description": "Critical path tests",
    "createdBy": "Alice",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "itemCount": 8
  }
]
```

---

### `POST /api/projects/:projectId/test-suites`

Create a test suite. Optionally pre-populate it with test cases.

**Auth:** Session + `PROJECT_ADMIN | QA`

**Request body**
```json
{
  "name": "Smoke Suite",
  "description": "Critical path tests",
  "testCaseIds": [1, 2, 3]
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | Yes | 1–200 characters |
| `description` | string | No | max 1000 characters |
| `testCaseIds` | integer[] | No | IDs must belong to the same project |

**Response 201**
```json
{ "id": 42 }
```

---

### `GET /api/projects/:projectId/test-suites/:suiteId`

Get suite details with its full item list (test cases with title and priority).

**Auth:** Session + any project membership

**Response 200**
```json
{
  "id": 1,
  "name": "Smoke Suite",
  "description": "...",
  "projectId": 1,
  "createdBy": "u-1",
  "createdAt": "2025-01-15T10:00:00.000Z",
  "items": [
    { "id": 5, "testCaseId": 10, "key": "TC-0001", "title": "Login test", "priority": "HIGH" }
  ]
}
```

---

### `PATCH /api/projects/:projectId/test-suites/:suiteId`

Update a suite's name or description.

**Auth:** Session + `PROJECT_ADMIN | QA`

**Request body**
```json
{ "name": "Renamed Suite", "description": "New description" }
```

**Response 200** — updated suite

---

### `DELETE /api/projects/:projectId/test-suites/:suiteId`

Delete a suite (does not delete test cases).

**Auth:** Session + `PROJECT_ADMIN | QA`

**Response 200**
```json
{ "success": true }
```

---

### `POST /api/projects/:projectId/test-suites/:suiteId/items`

Add test cases to a suite. Duplicates are silently ignored.

**Auth:** Session + `PROJECT_ADMIN | QA`

**Request body**
```json
{ "testCaseIds": [4, 5, 6] }
```

**Response 200**
```json
{ "success": true }
```

---

### `DELETE /api/projects/:projectId/test-suites/:suiteId/items`

Remove test cases from a suite.

**Auth:** Session + `PROJECT_ADMIN | QA`

**Request body**
```json
{ "testCaseIds": [4, 5] }
```

**Response 200**
```json
{ "success": true }
```

---

## Reports

### `GET /api/projects/:projectId/reports/export`

See [Test Run Export — multi-run](#get-apiprojectsprojectidreportsexport) above.

### `GET /api/projects/:projectId/reports/trends`

Fetch failure trend and flaky test data for a project.

**Auth:** Project member (any role)

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | integer | No | Number of recent completed runs (default: 20) |

**Response 200**
```json
{
  "failureTrend": [
    { "runId": 5, "name": "Sprint 3", "createdAt": "...", "totalCount": 20, "passCount": 18, "failCount": 2 }
  ],
  "flakyTests": [
    { "testCaseId": 10, "testCaseKey": "TC-0003", "title": "Login test", "totalExecs": 8, "passCount": 5, "failCount": 3 }
  ]
}
```

---

## Attachments

Attachments can be associated with test cases, test executions, or failure detail records.

Reference types: `TESTCASE | EXECUTION | FAILURE`

### `GET /api/attachments`

List attachments for a specific entity.

**Auth:** Session required

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `referenceType` | enum | Yes | `TESTCASE \| EXECUTION \| FAILURE` |
| `referenceId` | integer | Yes | ID of the referenced entity |

**Response 200** — array of attachment records
```json
[
  {
    "id": 1,
    "referenceType": "TESTCASE",
    "referenceId": 10,
    "fileName": "screenshot.png",
    "contentType": "image/png",
    "objectKey": "TESTCASE/10/2025-01-15T10:00:00.000Z_screenshot.png",
    "fileSize": 204800,
    "uploadedBy": "u-1",
    "uploadedAt": "2025-01-15T10:00:00.000Z"
  }
]
```

---

### `POST /api/attachments`

Upload a file and attach it to an entity.

**Auth:** Session required

**Request body:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | Max 10 MB |
| `referenceType` | string | Yes | `TESTCASE \| EXECUTION \| FAILURE` |
| `referenceId` | integer (as string) | Yes | ID of the entity |

**Allowed MIME types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`, `application/pdf`, `text/plain`, `text/csv`, `text/html`, `application/json`, OOXML (`xlsx`, `docx`), `application/zip`, `video/mp4`, `video/webm`

**Response 201** — created attachment record

---

### `GET /api/attachments/:attachmentId`

Download an attachment. The server verifies project membership before serving the file.

**Auth:** Session + project membership (resolved from the attachment's reference)

**Response** — raw file with appropriate `Content-Type` and `Content-Disposition: attachment` headers

---

### `DELETE /api/attachments/:attachmentId`

Delete an attachment (removes from storage and database).

**Auth:** Session required

**Response 204** — no content

---

## Users

### `GET /api/users/search`

Search users by name or email. Used for adding project members or assignees. Requires at least 2 characters.

**Auth:** Session required

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Min 2 characters |
| `excludeProjectId` | integer | No | Exclude users already in this project |
| `offset` | integer | No | Pagination offset (default 0, max 10 results per page) |

**Response 200**
```json
{
  "data": [
    { "id": "u-1", "name": "Alice Smith", "email": "alice@example.com" }
  ]
}
```

If `q` is shorter than 2 characters, returns `{ "data": [] }`.

---

### `GET /api/users/me/preferences`

Get the authenticated user's preferences (locale, theme, notification settings).

**Auth:** Session required

**Response 200**
```json
{
  "userId": "u-1",
  "locale": "en",
  "theme": "dark",
  "notificationSettings": {
    "enableInApp": true,
    "mutedTypes": ["COMMENT_ADDED"]
  }
}
```

`locale`, `theme`, and `notificationSettings` may be `null` if not set.

---

### `PUT /api/users/me/preferences`

Save or update preferences. Uses upsert semantics — a missing preference row is created automatically.

**Auth:** Session required

**Request body**
```json
{
  "locale": "ko",
  "theme": "system",
  "notificationSettings": {
    "enableInApp": true,
    "mutedTypes": ["TEST_FAILED"]
  }
}
```

| Field | Allowed values |
|---|---|
| `locale` | `en \| ko` |
| `theme` | `light \| dark \| system` |
| `notificationSettings.enableInApp` | `true \| false` |
| `notificationSettings.mutedTypes` | Array of notification type strings |

All fields are optional; omitted fields retain their current value.

**Notification types:** `TEST_RUN_COMPLETED`, `TEST_FAILED`, `COMMENT_ADDED`, `MEMBER_ADDED`, `ASSIGNED`, `USER_PENDING`

**Response 200** — full updated preference record

---

## Admin

These endpoints require the global `admin` role (`user.role === 'admin'`).

### `GET /api/admin/audit-logs`

Query the audit log with filtering and pagination.

**Auth:** Session + global admin

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Default 1 |
| `limit` | integer | Default 50, max 200 |
| `userId` | string | Filter by actor user ID |
| `action` | string | Filter by action string (e.g. `CREATE_PROJECT`) |
| `projectId` | integer | Filter by project |
| `from` | ISO date string | Start of date range |
| `to` | ISO date string | End of date range (inclusive, full day) |

**Response 200**
```json
{
  "data": [
    {
      "id": 1,
      "action": "CREATE_PROJECT",
      "entityType": "PROJECT",
      "entityId": "42",
      "projectId": 42,
      "metadata": { "name": "My Project" },
      "ipAddress": "192.0.2.1",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "userId": "u-1",
      "userName": "Alice",
      "userEmail": "alice@example.com"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 120,
    "totalPages": 3
  }
}
```

---

### `POST /api/admin/oidc-providers/discover`

Discover OpenID Connect endpoint URLs from an issuer's `.well-known/openid-configuration`. Implements SSRF protection: only HTTPS URLs are accepted (HTTP allowed for `localhost`), and the resolved IP must not be in a private/reserved range. Results are cached for 5 minutes.

**Auth:** Session + global admin

**Request body**
```json
{ "issuerUrl": "https://accounts.google.com" }
```

**Response 200**
```json
{
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth",
  "tokenUrl": "https://oauth2.googleapis.com/token",
  "userinfoUrl": "https://openidconnect.googleapis.com/v1/userinfo",
  "jwksUri": "https://www.googleapis.com/oauth2/v3/certs"
}
```

**Response 400** — invalid URL, non-HTTPS, private IP, DNS failure, or discovery fetch error

---

### User Approval (Form Actions on `/admin/users`)

The admin users page provides form actions for approving and rejecting pending users. These are SvelteKit form actions (not REST API endpoints).

| Action | Description |
|---|---|
| `approve` | Sets `user.approved = true`. Requires `userId` in form data. Logs `USER_APPROVED` audit event. |
| `reject` | Deletes the user account. Requires `userId` in form data. Logs `USER_REJECTED` audit event (before deletion). |

Both actions require the global `admin` role. Non-admin users receive `403`.

The user list load function supports a `?pending=true` query parameter to filter only unapproved users.

---

## Notifications

### `GET /api/notifications`

Fetch the authenticated user's notifications with cursor-based pagination.

**Auth:** Session required

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `unreadOnly` | boolean | `false` | Return only unread notifications |
| `limit` | integer | `20` | Max notifications per page (max 100) |
| `cursor` | string | — | ID of the last item from the previous page |

**Response 200**
```json
{
  "items": [
    {
      "id": 5,
      "userId": "u-1",
      "isRead": false,
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "nextCursor": "5",
  "hasMore": true
}
```

To fetch the next page, pass the returned `nextCursor` value as the `cursor` parameter.

---

### `POST /api/notifications/read`

Mark notifications as read. Supports marking all at once or specific IDs.

**Auth:** Session required

**Request body (mark all read)**
```json
{ "all": true }
```

**Request body (mark specific IDs)**
```json
{ "ids": [1, 2, 3] }
```

Only notifications belonging to the authenticated user are affected.

**Response 200**
```json
{ "ok": true }
```

---

## Templates

Test case templates are reusable scaffolds for creating test cases.

### `GET /api/projects/:projectId/templates`

List all templates for a project, ordered by name.

**Auth:** Session + any project membership

**Response 200**
```json
[
  {
    "id": 1,
    "name": "API Test Template",
    "description": "Template for REST API tests",
    "precondition": "API server is running",
    "steps": [
      { "order": 1, "action": "Send request", "expected": "Response code 200" }
    ],
    "priority": "MEDIUM",
    "createdBy": "Alice",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T10:00:00.000Z"
  }
]
```

---

### `POST /api/projects/:projectId/templates`

Create a new template.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body**
```json
{
  "name": "API Test Template",
  "description": "Optional description",
  "precondition": "API server is running",
  "steps": [
    { "action": "Send request", "expected": "Response 200" }
  ],
  "priority": "MEDIUM"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | Yes | 1–200 characters |
| `description` | string | No | — |
| `precondition` | string | No | — |
| `steps` | array | No | `{ action, expected }[]` |
| `priority` | string | No | Project-configured priority name (default `MEDIUM`) |

**Response 201**
```json
{ "id": 42 }
```

---

### `GET /api/projects/:projectId/templates/:templateId`

Get a single template by ID.

**Auth:** Session + any project membership

**Response 200** — full template record

---

### `PATCH /api/projects/:projectId/templates/:templateId`

Update template fields. All fields are optional.

**Auth:** Session + `PROJECT_ADMIN | QA | DEV`

**Request body** — same shape as POST, all fields optional

**Response 200**
```json
{ "success": true }
```

---

### `DELETE /api/projects/:projectId/templates/:templateId`

Delete a template.

**Auth:** Session + `PROJECT_ADMIN`

**Response 200**
```json
{ "success": true }
```

---

## Dashboard Layout

Each user's dashboard layout is stored per-project. The layout is a list of widget configurations.

### `GET /api/projects/:projectId/dashboard-layout`

Retrieve the authenticated user's dashboard layout for a project. If the user has no saved layout, the server returns the default layout. The response also reconciles the saved layout with any widgets that have been added or removed from the application since the last save.

**Auth:** Session + any project membership

**Response 200**
```json
{
  "layout": [
    { "id": "stats-overview", "visible": true, "order": 0, "size": "lg" },
    { "id": "recent-runs", "visible": true, "order": 1, "size": "md" },
    { "id": "test-case-distribution", "visible": false, "order": 2, "size": "sm" }
  ]
}
```

Widget config fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Widget identifier |
| `visible` | boolean | Whether the widget is shown |
| `order` | integer | Render position |
| `size` | `sm \| md \| lg` | Display size |

---

### `PUT /api/projects/:projectId/dashboard-layout`

Save the user's layout. Uses upsert — overwrites any existing layout for this user+project combination.

**Auth:** Session + any project membership

**Request body**
```json
{
  "layout": [
    { "id": "stats-overview", "visible": true, "order": 0, "size": "lg" }
  ]
}
```

All widget `id` values must be recognised by the application. Unknown IDs return `400`.

**Response 200** — the saved layout

---

## API Keys

Project-scoped API keys authenticate automation endpoints without a user session.

### `GET /api/projects/:projectId/api-keys`

List API keys for a project. The key hash is never returned; only the `prefix` (first 12 characters of the key) is shown.

**Auth:** Session + any project membership

**Response 200**
```json
[
  {
    "id": 1,
    "name": "CI Pipeline Key",
    "prefix": "tmk_a1b2c3d4",
    "lastUsedAt": "2025-01-14T08:30:00.000Z",
    "createdBy": "u-1",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

### `POST /api/projects/:projectId/api-keys`

Create a new API key. The raw key is returned **once** and cannot be retrieved again.

**Auth:** Session + `PROJECT_ADMIN`

**Request body**
```json
{ "name": "CI Pipeline Key" }
```

`name` is required and must not exceed 100 characters.

**Response 201**
```json
{
  "id": 1,
  "name": "CI Pipeline Key",
  "prefix": "tmk_a1b2c3d4",
  "key": "tmk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p",
  "createdAt": "2025-01-15T10:00:00.000Z"
}
```

**Store the `key` value immediately.** It cannot be retrieved later.

---

### `DELETE /api/projects/:projectId/api-keys/:keyId`

Revoke and delete an API key.

**Auth:** Session + `PROJECT_ADMIN`

**Response 200**
```json
{ "success": true }
```

---

## Automation

These endpoints are designed for CI/CD pipelines. They use API key authentication (no browser session).

All requests must include:
```
Authorization: Bearer tmk_<your-api-key>
```

### `POST /api/automation/results`

Submit test results from a CI run. The server:
1. Creates a new test run scoped to the API key's project
2. Matches each result's `automationKey` to a test case in the project
3. Creates an execution record for each matched result
4. Records failure details for `FAIL` results that include an `errorMessage`
5. Marks the run as `COMPLETED`

**Auth:** API key

**Request body**
```json
{
  "environment": "QA",
  "runName": "CI Build #42",
  "results": [
    {
      "automationKey": "login_happy_path",
      "status": "PASS",
      "duration": 1230
    },
    {
      "automationKey": "login_wrong_password",
      "status": "FAIL",
      "errorMessage": "Expected 401 but got 200",
      "duration": 450
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `results` | array | Yes | At least one result |
| `results[].automationKey` | string | Yes | Maps to `testCase.automationKey` in the project |
| `results[].status` | `PASS \| FAIL \| SKIP` | Yes | CI result; `SKIP` maps to `SKIPPED` |
| `results[].errorMessage` | string | No | Stored in failure detail for FAIL results |
| `results[].duration` | integer | No | Duration in ms; stored in failure comment |
| `environment` | enum | No | `DEV \| QA \| STAGE \| PROD` (default `QA`) |
| `runName` | string | No | Defaults to `CI Run YYYY-MM-DD HH:MM` |

**Response 200**
```json
{
  "runId": 55,
  "matched": 2,
  "unmatched": ["unknown_key"],
  "results": [
    { "automationKey": "login_happy_path", "status": "PASS", "testCaseId": 10 },
    { "automationKey": "unknown_key", "status": "FAIL", "testCaseId": null }
  ]
}
```

`unmatched` contains automation keys for which no test case was found in the project.

---

### `POST /api/automation/webhook`

Receive CI/CD build pipeline notifications from GitHub or GitLab. The server parses platform-specific payloads, logs build metadata, and acknowledges the webhook.

**Auth:** API key

**Headers (platform detection)**

| Header | Value |
|---|---|
| `X-GitHub-Event` | `workflow_run`, `ping` |
| `X-Gitlab-Event` | `Pipeline Hook` |

**GitHub workflow_run example body** (subset)
```json
{
  "action": "completed",
  "workflow_run": {
    "id": 1234567,
    "name": "CI",
    "head_branch": "main",
    "head_sha": "abc123def456",
    "status": "completed",
    "conclusion": "success",
    "html_url": "https://github.com/org/repo/actions/runs/1234567"
  },
  "repository": { "full_name": "org/repo" }
}
```

**GitLab Pipeline Hook example body** (subset)
```json
{
  "object_kind": "pipeline",
  "object_attributes": {
    "id": 42,
    "ref": "main",
    "sha": "abc123",
    "status": "success",
    "url": "https://gitlab.com/org/repo/-/pipelines/42"
  },
  "project": {
    "path_with_namespace": "org/repo",
    "web_url": "https://gitlab.com/org/repo"
  }
}
```

**Response 200**
```json
{
  "received": true,
  "message": "GitHub workflow \"CI\" completed with status: success",
  "meta": {
    "platform": "github",
    "repo": "org/repo",
    "branch": "main",
    "commitSha": "abc123de",
    "buildStatus": "success",
    "isCompleted": true
  }
}
```

Unknown platforms return `{ "received": true, "message": "Webhook received. Use X-GitHub-Event or X-Gitlab-Event header for platform detection." }`.

---

## Priority Configuration

Priorities are configurable per project. Each project has its own set of priority levels with custom names, colors, and display order. Default priorities (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) are seeded when a project is created.

Priority configuration is managed through the project settings UI at `/projects/:projectId/settings/priorities` (form actions, not REST API). The `priority_config` table stores priority definitions per project.

**Schema:** `priority_config`

| Column | Type | Description |
|---|---|---|
| `id` | serial | Primary key |
| `projectId` | integer | FK to `project` |
| `name` | varchar(30) | Priority name (unique within project) |
| `color` | varchar(7) | Hex color (e.g. `#ef4444`) |
| `position` | integer | Display order (0-based) |
| `isDefault` | boolean | Whether this is the default priority for new test cases |
| `createdBy` | varchar | FK to `user` |
| `createdAt` | timestamp | — |

**Form actions** (on `/projects/:projectId/settings/priorities`):

| Action | Description | Auth |
|---|---|---|
| `create` | Add a new priority level | PROJECT_ADMIN, QA, DEV |
| `update` | Edit name/color/default; propagates name changes to test_case_version and test_case_template | PROJECT_ADMIN, QA, DEV |
| `delete` | Remove a priority level | PROJECT_ADMIN, QA, DEV |
| `reorder` | Reorder priority display positions | PROJECT_ADMIN, QA, DEV |

Priority values in test cases and templates are stored as plain text strings that reference priority names from this configuration.

---

## Environment Configuration

Environments are configurable per project. Each project has its own set of environments with custom names, colors, and display order. Default environments (`DEV`, `QA`, `STAGE`, `PROD`) are seeded when a project is created.

Environment configuration is managed through the project settings UI at `/projects/:projectId/settings/environments` (form actions, not REST API). The `environment_config` table stores environment definitions per project.

**Schema:** `environment_config`

| Column | Type | Description |
|---|---|---|
| `id` | serial | Primary key |
| `projectId` | integer | FK to `project` |
| `name` | varchar(30) | Environment name (unique within project) |
| `color` | varchar(7) | Hex color (e.g. `#3b82f6`) |
| `position` | integer | Display order (0-based) |
| `isDefault` | boolean | Whether this is the default environment for new test runs |
| `createdBy` | varchar | FK to `user` |
| `createdAt` | timestamp | — |

**Form actions** (on `/projects/:projectId/settings/environments`):

| Action | Description | Auth |
|---|---|---|
| `create` | Add a new environment | PROJECT_ADMIN, QA, DEV |
| `update` | Edit name/color/default; propagates name changes to `test_run.environment` | PROJECT_ADMIN, QA, DEV |
| `delete` | Remove an environment | PROJECT_ADMIN, QA, DEV |
| `reorder` | Reorder environment display positions | PROJECT_ADMIN, QA, DEV |

Environment values in test runs are stored as plain text strings that reference environment names from this configuration. The automation API (`POST /api/automation/results`) also accepts any string as the environment value.

---

## Test Plans

Test plans are a planning layer above test runs. A plan groups test cases for a particular milestone or release cycle, and can generate one or more test runs when ready for execution.

### Schema

**`test_plan` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `project_id` | integer FK → project | cascade delete |
| `name` | text | required |
| `description` | text | optional |
| `status` | enum | `DRAFT`, `IN_REVIEW`, `APPROVED`, `ACTIVE`, `COMPLETED`, `ARCHIVED` (default: `DRAFT`) |
| `milestone` | text | optional label |
| `start_date` | timestamp | optional |
| `end_date` | timestamp | optional |
| `created_by` | text FK → user | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | auto-updated |

**`test_plan_test_case` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `test_plan_id` | integer FK → test_plan | cascade delete |
| `test_case_id` | integer FK → test_case | cascade delete |
| `position` | integer | ordering within plan (default: 0) |
| `added_at` | timestamp | |

Unique constraint on `(test_plan_id, test_case_id)`.

**`test_run.test_plan_id`** — nullable FK to `test_plan` (set null on delete). Links a run back to the plan that created it.

### Status Lifecycle

```
DRAFT → IN_REVIEW → APPROVED → ACTIVE → COMPLETED
                                          ↑
Any state ──────────────────────────→ ARCHIVED
```

### List Test Plans

`GET /api/projects/:projectId/test-plans`

**Auth:** Any project member (via `withProjectAccess`)

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Optional. Filter by plan status. Valid values: `DRAFT`, `IN_REVIEW`, `APPROVED`, `ACTIVE`, `COMPLETED`, `ARCHIVED` |

**Response 200:**
```json
[
  {
    "id": 1,
    "name": "Sprint 12 Plan",
    "description": "Regression for v2.5 release",
    "status": "ACTIVE",
    "milestone": "v2.5",
    "startDate": "2026-03-01T00:00:00.000Z",
    "endDate": "2026-03-15T00:00:00.000Z",
    "createdBy": "John Doe",
    "createdAt": "2026-03-01T10:00:00.000Z",
    "itemCount": 15,
    "runCount": 2
  }
]
```

### Create Test Plan

`POST /api/projects/:projectId/test-plans`

**Auth:** PROJECT_ADMIN, QA, DEV (via `withProjectRole`)

**Request body:**
```json
{
  "name": "Sprint 12 Plan",
  "description": "Optional description",
  "milestone": "v2.5",
  "startDate": "2026-03-01",
  "endDate": "2026-03-15",
  "testCaseIds": [1, 2, 3]
}
```

Required: `name`, `testCaseIds` (can be empty array). Optional: `description`, `milestone`, `startDate`, `endDate`.

**Response 201:**
```json
{ "id": 1 }
```

### Get Test Plan Detail

`GET /api/projects/:projectId/test-plans/:planId`

**Auth:** Any project member (via `withProjectAccess`)

**Response 200:**
```json
{
  "id": 1,
  "projectId": 5,
  "name": "Sprint 12 Plan",
  "description": "...",
  "status": "ACTIVE",
  "milestone": "v2.5",
  "startDate": "2026-03-01T00:00:00.000Z",
  "endDate": "2026-03-15T00:00:00.000Z",
  "createdBy": "abc123",
  "createdByName": "John Doe",
  "createdAt": "2026-03-01T10:00:00.000Z",
  "updatedAt": "2026-03-05T14:00:00.000Z",
  "items": [
    {
      "id": 1,
      "testCaseId": 10,
      "key": "TC-10",
      "title": "Login test",
      "priority": "HIGH",
      "position": 0
    }
  ],
  "runs": [
    {
      "id": 3,
      "name": "Sprint 12 Run 1",
      "status": "IN_PROGRESS",
      "environment": "QA",
      "createdAt": "2026-03-06T09:00:00.000Z"
    }
  ]
}
```

### Update Test Plan

`PATCH /api/projects/:projectId/test-plans/:planId`

**Auth:** PROJECT_ADMIN, QA, DEV (via `withProjectRole`)

**Request body (all fields optional):**
```json
{
  "name": "Updated name",
  "description": "Updated description",
  "status": "APPROVED",
  "milestone": "v2.6",
  "startDate": "2026-03-10",
  "endDate": "2026-03-20"
}
```

**Response 200:** Updated plan object.

### Delete Test Plan

`DELETE /api/projects/:projectId/test-plans/:planId`

**Auth:** PROJECT_ADMIN (via `withProjectRole`)

**Response 200:**
```json
{ "success": true }
```

Linked `test_plan_test_case` rows are cascade-deleted. Linked `test_run.test_plan_id` is set to null.

### Add Test Cases to Plan

`POST /api/projects/:projectId/test-plans/:planId/items`

**Auth:** PROJECT_ADMIN, QA, DEV (via `withProjectRole`)

**Request body:**
```json
{
  "testCaseIds": [4, 5, 6]
}
```

Duplicate test cases are silently skipped. All test case IDs must belong to the same project.

**Response 200:**
```json
{ "success": true }
```

### Remove Test Cases from Plan

`DELETE /api/projects/:projectId/test-plans/:planId/items`

**Auth:** PROJECT_ADMIN, QA, DEV (via `withProjectRole`)

**Request body:**
```json
{
  "testCaseIds": [4, 5]
}
```

**Response 200:**
```json
{ "success": true }
```

### Create Test Run from Plan

`POST /api/projects/:projectId/test-plans/:planId/create-run`

**Auth:** PROJECT_ADMIN, QA, DEV (via `withProjectRole`)

Creates a new test run containing all test cases currently in the plan. Parameterized test cases are automatically expanded (one execution per data set row). The created run's `testPlanId` links back to the plan.

**Request body:**
```json
{
  "name": "Sprint 12 Run 1",
  "environment": "QA"
}
```

**Response 201:**
```json
{ "runId": 42 }
```

**Errors:**
- `400` — Plan has no test cases
- `404` — Plan not found

---

## MCP Server

TestMini exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) endpoint so that AI assistants (Claude, Cursor, etc.) can interact with project data programmatically.

### Endpoint

`GET|POST|DELETE /api/mcp`

Authentication: Bearer API key (same as automation API).

### Transport

Uses the MCP Streamable HTTP transport (`WebStandardStreamableHTTPServerTransport`). Stateful sessions are managed via `mcp-session-id` header.

### Resources

| Resource | URI | Description |
|----------|-----|-------------|
| `test-cases` | `test-cases://list` | All test cases with latest version title, priority, key |
| `test-runs` | `test-runs://list` | Recent test runs (last 50) with status |
| `summary` | `reports://summary` | Total test case count + recent 5 runs |
| `project` | `projects://current` | Current project info with counts, members, environments, priorities |

### Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `search-test-cases` | `query`, `limit?` | Full-text search across test cases |
| `get-test-case` | `id?`, `key?` | Get test case detail with version and tags |
| `get-test-run` | `runId` | Get test run with execution status counts |
| `get-failures` | `runId` | Get failure details (error messages, stack traces) |
| `create-test-case` | `title`, `priority?`, `precondition?`, `steps?`, `expectedResult?` | Create a new test case |
| `update-test-case` | `id?`, `key?`, `title?`, `priority?`, `precondition?`, `steps?`, `expectedResult?` | Update test case (creates new version) |
| `create-test-run` | `name`, `environment`, `testCaseIds?` | Create test run with selected or all test cases |
| `record-failure-detail` | `runId`, `executionId`, `errorMessage?`, `stackTrace?`, `failureEnvironment?`, `comment?` | Record failure details for execution |
| `export-run-results` | `runId` | Export test run results as structured JSON |
| `update-execution-status` | `runId`, `executionId`, `status` | Update execution status (PASS/FAIL/BLOCKED/SKIPPED/PENDING) |

### Resource: `projects://current` Response

```json
{
  "id": 1,
  "name": "My Project",
  "description": "Project description",
  "active": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "counts": {
    "testCases": 25,
    "testRuns": 10,
    "testSuites": 3,
    "testPlans": 2,
    "members": 4
  },
  "members": [
    { "userId": "user-1", "role": "PROJECT_ADMIN" }
  ],
  "environments": [
    { "name": "DEV", "color": "#22c55e" }
  ],
  "priorities": [
    { "name": "HIGH", "color": "#ef4444" }
  ]
}
```

### MCP Client Configuration

```json
{
  "mcpServers": {
    "testmini": {
      "url": "https://your-instance.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer tmk_your_api_key"
      }
    }
  }
}
```

---

## Webhooks

Per-project outgoing webhook configuration. Webhooks are triggered automatically when notification events occur (test run completed, test failed, comment added, member added, assigned). Requires `PROJECT_ADMIN` role for create/update/delete.

### List webhooks

```
GET /api/projects/:projectId/webhooks
```

**Response:** `200 OK`

```json
[
  {
    "id": 1,
    "name": "Slack #testing",
    "url": "https://hooks.slack.com/services/...",
    "events": ["TEST_RUN_COMPLETED", "TEST_FAILED"],
    "enabled": true,
    "createdAt": "2025-03-08T..."
  }
]
```

### Create webhook

```
POST /api/projects/:projectId/webhooks
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name (max 100 chars) |
| `url` | string | Yes | HTTP/HTTPS endpoint URL |
| `secret` | string | No | HMAC-SHA256 signing secret |
| `events` | string[] | No | Event filter (empty = all events) |

Valid events: `TEST_RUN_COMPLETED`, `TEST_FAILED`, `COMMENT_ADDED`, `MEMBER_ADDED`, `ASSIGNED`

**Response:** `201 Created`

### Update webhook

```
PATCH /api/projects/:projectId/webhooks/:webhookId
```

**Body:** Any subset of `name`, `url`, `secret`, `events`, `enabled`.

**Response:** `200 OK`

### Delete webhook

```
DELETE /api/projects/:projectId/webhooks/:webhookId
```

**Response:** `200 OK` `{ "success": true }`

### Test webhook

```
POST /api/projects/:projectId/webhooks/:webhookId/test
```

Sends a test payload to the webhook URL.

**Response:** `200 OK` `{ "success": true }`

### Webhook payload format

All webhook deliveries use `POST` with `Content-Type: application/json`:

```json
{
  "event": "TEST_RUN_COMPLETED",
  "projectId": 1,
  "timestamp": "2025-03-08T12:00:00.000Z",
  "data": {
    "title": "Test run completed",
    "message": "\"Sprint 1\" has been completed",
    "link": "/projects/1/test-runs/42"
  }
}
```

If a signing secret is configured, the request includes an `X-Webhook-Signature` header with `sha256=<hex>` (HMAC-SHA256 of the raw JSON body).

---

## Issue Tracker

Per-project external issue tracker configuration. Supports Jira, GitHub Issues, GitLab Issues, and custom webhook providers.

### `GET /api/projects/:projectId/issue-tracker`

Returns the issue tracker configuration for the project, or `null` if not configured.

**Auth:** Any project member

**Response:** `200 OK`

```json
{
  "id": 1,
  "provider": "JIRA",
  "baseUrl": "https://company.atlassian.net",
  "projectKey": "PROJ",
  "customTemplate": null,
  "enabled": true,
  "hasApiToken": true,
  "createdAt": "2025-03-08T00:00:00.000Z"
}
```

> Note: The raw `apiToken` is never returned. Only `hasApiToken` (boolean) indicates whether a token is stored.

### `POST /api/projects/:projectId/issue-tracker`

Creates or updates the issue tracker configuration. If a config already exists for the project, it is updated (upsert).

**Auth:** `PROJECT_ADMIN`

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `provider` | `string` | Yes | One of: `JIRA`, `GITHUB`, `GITLAB`, `CUSTOM` |
| `baseUrl` | `string` | Yes | Must be a valid `http` or `https` URL |
| `apiToken` | `string` | No | Stored securely. Omit to keep existing token on update |
| `projectKey` | `string` | No | Jira project key, GitHub `owner/repo`, or GitLab project ID |
| `customTemplate` | `object` | No | Custom provider template (e.g., `{ "headers": {...} }`) |
| `enabled` | `boolean` | No | Default `true` |

**Response:** `201 Created` (new) or `200 OK` (update) — same shape as GET

### `DELETE /api/projects/:projectId/issue-tracker`

Removes the issue tracker configuration.

**Auth:** `PROJECT_ADMIN`

**Response:** `200 OK` `{ "success": true }`

### `POST /api/projects/:projectId/issue-tracker/test`

Tests connectivity to the configured issue tracker.

**Auth:** `PROJECT_ADMIN`

**Response:** `200 OK`

```json
{ "ok": true, "message": "Connected as Test User" }
```

Returns `404` if no tracker is configured. Returns `{ "ok": false, "message": "..." }` if the tracker is disabled or the connection fails.

---

## Issue Links

Link test cases or test executions to external issues (Jira tickets, GitHub issues, etc.).

### `GET /api/projects/:projectId/issue-links`

Lists issue links for the project, optionally filtered by test case or execution.

**Auth:** Any project member

**Query params:**

| Param | Type | Description |
|---|---|---|
| `testCaseId` | `number` | Filter by test case ID |
| `testExecutionId` | `number` | Filter by test execution ID |

**Response:** `200 OK`

```json
[
  {
    "id": 1,
    "testCaseId": 10,
    "testExecutionId": null,
    "externalUrl": "https://company.atlassian.net/browse/PROJ-123",
    "externalKey": "PROJ-123",
    "title": "Login bug",
    "status": null,
    "provider": "JIRA",
    "createdAt": "2025-03-08T00:00:00.000Z"
  }
]
```

### `POST /api/projects/:projectId/issue-links`

Manually links an external issue URL to a test case or execution.

**Auth:** `PROJECT_ADMIN`, `QA`, or `DEV`

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `testCaseId` | `number` | * | At least one of `testCaseId` or `testExecutionId` required |
| `testExecutionId` | `number` | * | |
| `externalUrl` | `string` | Yes | Must be a valid `http`/`https` URL |
| `externalKey` | `string` | No | e.g., `PROJ-123`, `#42` |
| `title` | `string` | No | Issue title |

**Response:** `201 Created` — issue link object

### `PATCH /api/projects/:projectId/issue-links/:linkId`

Updates an issue link's title or status.

**Auth:** `PROJECT_ADMIN`, `QA`, or `DEV`

**Body:**

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | New title (empty string clears it) |
| `status` | `string` | New status (e.g., `OPEN`, `CLOSED`) |

At least one field must be provided.

**Response:** `200 OK` — updated issue link object

### `DELETE /api/projects/:projectId/issue-links/:linkId`

Removes an issue link.

**Auth:** `PROJECT_ADMIN`, `QA`, or `DEV`

**Response:** `200 OK` `{ "success": true }`

### `POST /api/projects/:projectId/issue-links/create-issue`

Creates an external issue via the configured tracker and automatically links it to a test case or execution.

**Auth:** `PROJECT_ADMIN`, `QA`, or `DEV`

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `testCaseId` | `number` | * | At least one of `testCaseId` or `testExecutionId` required |
| `testExecutionId` | `number` | * | |
| `title` | `string` | Yes | Issue title |
| `description` | `string` | No | Issue description/body |

**Response:** `201 Created` — issue link object with external URL and key

Returns `404` if no tracker is configured. Returns `400` if the tracker is disabled or external issue creation fails.

---

## Requirements (Traceability)

Manage requirements and link them to test cases for end-to-end traceability.

### `GET /api/projects/:projectId/requirements`

Lists all requirements for the project with linked test case counts and coverage status.

**Auth:** Any project member

**Response:** `200 OK`

```json
[
  {
    "id": 1,
    "externalId": "REQ-001",
    "title": "User login",
    "description": "Users must be able to log in",
    "source": "Jira",
    "testCaseCount": 3,
    "coverage": { "pass": 2, "fail": 1, "pending": 0, "blocked": 0, "skipped": 0, "notExecuted": 0 },
    "createdAt": "2025-03-08T00:00:00.000Z"
  }
]
```

### `POST /api/projects/:projectId/requirements`

Creates a new requirement.

**Auth:** `PROJECT_ADMIN` or `QA`

**Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | `string` | Yes | Requirement title |
| `externalId` | `string` | No | External tracker ID (e.g., JIRA-123) |
| `description` | `string` | No | Requirement description |
| `source` | `string` | No | Source system (e.g., Jira, Confluence) |

**Response:** `201 Created`

### `PATCH /api/projects/:projectId/requirements/:requirementId`

Updates a requirement.

**Auth:** `PROJECT_ADMIN` or `QA`

**Body:** Same fields as POST (all optional). At least one field required.

**Response:** `200 OK`

### `DELETE /api/projects/:projectId/requirements/:requirementId`

Deletes a requirement and all its test case links.

**Auth:** `PROJECT_ADMIN` or `QA`

**Response:** `200 OK` `{ "success": true }`

### `POST /api/projects/:projectId/requirements/:requirementId/test-cases`

Links test cases to a requirement.

**Auth:** `PROJECT_ADMIN` or `QA`

**Body:**

```json
{ "testCaseIds": [10, 20, 30] }
```

**Response:** `200 OK` `{ "linked": 3 }`

### `DELETE /api/projects/:projectId/requirements/:requirementId/test-cases?testCaseId=10`

Unlinks a test case from a requirement.

**Auth:** `PROJECT_ADMIN` or `QA`

**Response:** `200 OK` `{ "success": true }`

### `GET /api/projects/:projectId/requirements/matrix`

Returns the full traceability matrix with requirements, linked test cases, and latest execution statuses.

**Auth:** Any project member

**Response:** `200 OK`

```json
{
  "requirements": [
    {
      "id": 1,
      "externalId": "REQ-001",
      "title": "User login",
      "source": "Jira",
      "testCases": [
        { "id": 10, "key": "TC-0001", "title": "Login flow", "latestStatus": "PASS" }
      ]
    }
  ]
}
```

### `GET /api/projects/:projectId/requirements/matrix/export`

Exports the traceability matrix as CSV.

**Auth:** Any project member

**Response:** CSV file download with columns: Requirement ID, External ID, Title, Source, Test Case Key, Test Case Title, Latest Status

---

## Common Error Responses

| Status | Description |
|---|---|
| `400` | Bad request — invalid input, missing fields, or malformed JSON |
| `401` | Unauthenticated — no valid session or API key |
| `403` | Forbidden — authenticated but lacks required role |
| `404` | Resource not found |
| `409` | Conflict — duplicate key, concurrent edit conflict, or invalid state transition |
| `503` | Service unavailable — database connectivity failure (health check only) |

All error responses follow one of these shapes:

```json
{ "error": "Human-readable message" }
```
or for validation errors:
```json
{ "error": { "fieldName": ["validation message"] } }
```

---

## Saved Filters

Saved filters allow users to save and quickly apply filter presets for test case lists.

### List saved filters

`GET /api/projects/:projectId/saved-filters?type=test_cases`

Returns the current user's saved filters for the project, ordered by sortOrder.

### Create saved filter

`POST /api/projects/:projectId/saved-filters`

```json
{ "name": "My failing tests", "filterType": "test_cases", "filters": { "priority": "HIGH,CRITICAL", "execStatus": "FAIL" } }
```

Returns `201` with the created filter. Name must be unique per user per project.

### Update saved filter

`PATCH /api/projects/:projectId/saved-filters/:filterId`

```json
{ "name": "New name", "filters": { "priority": "HIGH" } }
```

Only the filter owner can update. Returns the updated filter.

### Delete saved filter

`DELETE /api/projects/:projectId/saved-filters/:filterId`

Only the filter owner can delete. Returns `{ "success": true }`.

---

## Report Export & Sharing

### Export PDF

`GET /api/projects/:projectId/reports/pdf?from=2025-01-01&to=2025-01-31`

Generates a PDF report with environment summary, priority breakdown, top failing tests, and recent runs. Returns `application/pdf`.

Query params: `from`, `to`, `preset` (same as reports page).

### List shared report links

`GET /api/projects/:projectId/reports/share`

Returns all shared report links for the project.

### Create shared report link

`POST /api/projects/:projectId/reports/share`

```json
{ "name": "Q1 Report", "config": { "from": "2025-01-01", "to": "2025-03-31" }, "expiresInDays": 30 }
```

Returns `201` with `{ id, token, url }`. The URL at `/shared/:token` is publicly accessible without authentication.

Requires PROJECT_ADMIN or QA role.

### Revoke shared report link

`DELETE /api/projects/:projectId/reports/share/:shareId`

Requires PROJECT_ADMIN or QA role.

### Public shared report

`GET /shared/:token` (page route, not API)

Renders a read-only report view. No authentication required. Returns 404 if token invalid, 410 if expired.

---

## Report Schedules

### List schedules

`GET /api/projects/:projectId/reports/schedules`

Returns all report schedules for the project.

### Create schedule

`POST /api/projects/:projectId/reports/schedules`

```json
{
  "name": "Weekly Summary",
  "cronExpression": "0 9 * * 1",
  "recipientEmails": ["team@example.com"],
  "reportRange": "last_7_days"
}
```

Requires PROJECT_ADMIN role. Valid report ranges: `last_7_days`, `last_30_days`, `all`.

### Update schedule

`PATCH /api/projects/:projectId/reports/schedules/:scheduleId`

```json
{ "enabled": false }
```

Requires PROJECT_ADMIN role.

### Delete schedule

`DELETE /api/projects/:projectId/reports/schedules/:scheduleId`

Requires PROJECT_ADMIN role.

---

## Issue Link Status Sync

### Sync single issue link status

`POST /api/projects/:projectId/issue-links/:linkId/sync`

Fetches the current status from the external issue tracker (Jira/GitHub/GitLab) and updates the status in the database. Not available for CUSTOM provider.

Requires PROJECT_ADMIN, QA, or DEV role.

### Bulk sync issue link statuses

`POST /api/projects/:projectId/issue-links/sync?testCaseId=123`

Syncs all issue links for the project (or scoped to a test case/execution). Returns `{ synced, failed, total }`.

Optional query params: `testCaseId`, `testExecutionId`.

---

## Custom Fields

Per-project custom field definitions for test cases. Field values are stored in JSONB on `test_case_version`.

### List custom fields

`GET /api/projects/:projectId/custom-fields`

**Auth:** Project member (any role)

Returns all custom fields for the project, ordered by `sortOrder`.

**Response 200**
```json
[
  {
    "id": 1,
    "projectId": 1,
    "name": "Browser",
    "fieldType": "SELECT",
    "options": ["Chrome", "Firefox", "Safari"],
    "required": false,
    "sortOrder": 1,
    "createdBy": "user-1"
  }
]
```

### Create custom field

`POST /api/projects/:projectId/custom-fields`

**Auth:** PROJECT_ADMIN

```json
{
  "name": "Browser",
  "fieldType": "SELECT",
  "options": ["Chrome", "Firefox", "Safari"],
  "required": false
}
```

Valid field types: `TEXT`, `NUMBER`, `SELECT`, `MULTISELECT`, `DATE`, `CHECKBOX`, `URL`.

`options` is required for `SELECT` and `MULTISELECT` types.

**Response 201** — created field object.

### Update custom field

`PATCH /api/projects/:projectId/custom-fields/:fieldId`

**Auth:** PROJECT_ADMIN

```json
{ "name": "Updated Name", "options": ["A", "B"], "required": true, "sortOrder": 2 }
```

Note: `fieldType` cannot be changed after creation.

**Response 200** — updated field object.

### Delete custom field

`DELETE /api/projects/:projectId/custom-fields/:fieldId`

**Auth:** PROJECT_ADMIN

**Response 200** — `{ "success": true }`

---

## Execution Comments

Comments on individual test run executions. Supports threaded replies (one level deep).

### List execution comments

`GET /api/projects/:projectId/test-runs/:runId/executions/:executionId/comments`

**Auth:** Project member (any role)

Returns all comments for the execution, ordered by creation time.

**Response 200**
```json
[
  {
    "id": 1,
    "testExecutionId": 10,
    "userId": "user-1",
    "content": "This fails intermittently on CI.",
    "parentId": null,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "userName": "Alice",
    "userEmail": "alice@example.com",
    "userImage": null
  }
]
```

### Create execution comment

`POST /api/projects/:projectId/test-runs/:runId/executions/:executionId/comments`

**Auth:** PROJECT_ADMIN, QA, or DEV

```json
{ "content": "Looks like a timing issue.", "parentId": null }
```

`parentId` is optional — set to a top-level comment ID to create a reply. Replies cannot be nested further (parent must have `parentId: null`).

Content max length: 10,000 characters.

**Response 201** — created comment with user info.

### Update execution comment

`PATCH /api/projects/:projectId/test-runs/:runId/executions/:executionId/comments/:commentId`

**Auth:** Comment author or global admin

```json
{ "content": "Updated comment text." }
```

**Response 200** — updated comment object.

### Delete execution comment

`DELETE /api/projects/:projectId/test-runs/:runId/executions/:executionId/comments/:commentId`

**Auth:** Comment author or global admin

Deletes the comment and all its replies.

**Response 200** — `{ "success": true }`

---

## Branding

### Get branding asset

`GET /api/branding/:path`

**Auth:** None (public)

Serves uploaded branding assets (logo, favicon). Returns the file with appropriate MIME type and 24-hour cache header.

Supported formats: PNG, JPG, JPEG, SVG, WebP, ICO.

**Path validation:** The `:path` parameter must start with `branding/` and must not contain `..` or `//` (returns 400 if violated).

**Response 200** — binary file with `Content-Type` header.
**Response 404** — file not found.

---

## Parameterized Tests

### Test Case Parameters

Parameters define variable names (e.g., `username`, `password`) that can be used in test case steps as `{{variable}}` placeholders.

#### List Parameters

`GET /api/projects/:projectId/test-cases/:testCaseId/parameters`

**Auth:** Session or API Key (project access)

**Response 200:**
```json
[
  { "id": 1, "testCaseId": 42, "name": "username", "orderIndex": 0 },
  { "id": 2, "testCaseId": 42, "name": "password", "orderIndex": 1 }
]
```

#### Create Parameter

`POST /api/projects/:projectId/test-cases/:testCaseId/parameters`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{ "name": "username" }
```

**Response 201:** Created parameter object.

#### Update Parameter

`PATCH /api/projects/:projectId/test-cases/:testCaseId/parameters/:parameterId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{ "name": "new_name", "orderIndex": 2 }
```

**Response 200:** `{ "success": true }`

#### Delete Parameter

`DELETE /api/projects/:projectId/test-cases/:testCaseId/parameters/:parameterId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Response 200:** `{ "success": true }`

---

### Test Case Data Sets

Data sets are rows of parameter values for parameterized test cases. Each row maps parameter names to values. When a test run is created, parameterized test cases are expanded into one execution per data set row.

#### List Data Sets

`GET /api/projects/:projectId/test-cases/:testCaseId/datasets`

**Auth:** Session or API Key (project access)

**Response 200:**
```json
[
  { "id": 1, "testCaseId": 42, "name": "Valid admin", "values": { "username": "admin", "password": "pass123" }, "orderIndex": 0 },
  { "id": 2, "testCaseId": 42, "name": "Invalid user", "values": { "username": "", "password": "x" }, "orderIndex": 1 }
]
```

#### Create Data Set

`POST /api/projects/:projectId/test-cases/:testCaseId/datasets`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{ "name": "Valid admin", "values": { "username": "admin", "password": "pass123" } }
```

**Response 201:** Created data set object.

#### Update Data Set

`PATCH /api/projects/:projectId/test-cases/:testCaseId/datasets/:datasetId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{ "name": "Updated label", "values": { "username": "new", "password": "val" } }
```

**Response 200:** `{ "success": true }`

#### Delete Data Set

`DELETE /api/projects/:projectId/test-cases/:testCaseId/datasets/:datasetId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Response 200:** `{ "success": true }`

#### Import Data Sets from CSV

`POST /api/projects/:projectId/test-cases/:testCaseId/datasets/import`

**Auth:** PROJECT_ADMIN, QA, DEV

**Content-Type:** `multipart/form-data`

**Body:** `file` — CSV file. First row is headers (parameter names), subsequent rows are data values.

**Response 200:**
```json
{ "imported": 5 }
```

Missing parameters are automatically created.

---

### Shared Data Sets

Project-level reusable data sets that can be linked to multiple test cases.

#### List Shared Data Sets

`GET /api/projects/:projectId/shared-datasets`

**Auth:** Session or API Key (project access)

**Response 200:**
```json
[
  {
    "id": 1,
    "projectId": 10,
    "name": "Valid Users",
    "parameters": ["username", "password", "role"],
    "rows": [
      { "username": "admin", "password": "pass", "role": "admin" }
    ],
    "createdBy": "user_id",
    "createdAt": "2026-03-08T00:00:00.000Z"
  }
]
```

#### Create Shared Data Set

`POST /api/projects/:projectId/shared-datasets`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{
  "name": "Valid Users",
  "parameters": ["username", "password"],
  "rows": [
    { "username": "admin", "password": "pass123" }
  ]
}
```

**Response 201:** Created shared data set object.

#### Update Shared Data Set

`PATCH /api/projects/:projectId/shared-datasets/:datasetId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{ "name": "Updated name", "parameters": ["a", "b"], "rows": [{ "a": "1", "b": "2" }] }
```

**Response 200:** `{ "success": true }`

#### Delete Shared Data Set

`DELETE /api/projects/:projectId/shared-datasets/:datasetId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Response 200:** `{ "success": true }`

#### Link Shared Data Set to Test Case

`POST /api/projects/:projectId/shared-datasets/:datasetId/link`

**Auth:** PROJECT_ADMIN, QA, DEV

Copies the shared data set rows into the test case's data sets, and creates any missing parameters.

**Body:**
```json
{ "testCaseId": 42 }
```

**Response 200:**
```json
{ "linked": 3 }
```

---

## Exploratory Sessions

Timer-based exploratory testing sessions with free-form notes, screenshots, and test charters.

### List Sessions

`GET /api/projects/:projectId/exploratory-sessions`

**Auth:** Any project member

**Query params:**
- `status` (optional): `ACTIVE` | `PAUSED` | `COMPLETED`
- `limit` (optional, default 20, max 50)
- `offset` (optional, default 0)

**Response 200:**
```json
{
  "sessions": [
    {
      "id": 1,
      "title": "Login flow exploration",
      "charter": "Explore edge cases in login",
      "status": "ACTIVE",
      "startedAt": "2026-03-08T10:00:00Z",
      "pausedDuration": 0,
      "completedAt": null,
      "environment": "Staging",
      "tags": ["login", "security"],
      "createdBy": "John",
      "createdById": "user_abc123",
      "noteCount": 3
    }
  ],
  "total": 1
}
```

### Create Session

`POST /api/projects/:projectId/exploratory-sessions`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{
  "title": "Login flow exploration",
  "charter": "Explore edge cases in login",
  "environment": "Staging",
  "tags": ["login", "security"]
}
```

**Validation:**
- `title` (required): Max 500 characters
- `charter` (optional): String
- `environment` (optional): String
- `tags` (optional): Array of strings

**Response 201:** Created session object.

### Get Session

`GET /api/projects/:projectId/exploratory-sessions/:sessionId`

**Auth:** Any project member

**Response 200:** Session object with `notes` array and `creator` object.

### Update Session

`PATCH /api/projects/:projectId/exploratory-sessions/:sessionId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Body:**
```json
{
  "action": "pause" | "resume" | "complete",
  "summary": "Found 2 bugs in login flow",
  "pausedDuration": 120
}
```

Other updatable fields: `title`, `charter`, `environment`, `tags`.

**State transition rules:**
- `pause`: Only from `ACTIVE` state
- `resume`: Only from `PAUSED` state
- `complete`: From `ACTIVE` or `PAUSED` state (not from `COMPLETED`)

**Response 200:** Updated session object.

**Error responses:**
- `400` - Invalid state transition (e.g., pausing a paused session)
- `400` - Empty title, no fields to update
- `404` - Session not found

### Delete Session

`DELETE /api/projects/:projectId/exploratory-sessions/:sessionId`

**Auth:** PROJECT_ADMIN, QA, DEV

**Response 200:** `{ "success": true }`

### Add Note

`POST /api/projects/:projectId/exploratory-sessions/:sessionId/notes`

**Auth:** PROJECT_ADMIN, QA, DEV

**Content-Type:** `multipart/form-data`

**Fields:**
- `content` (required): Note text
- `noteType` (optional, default `NOTE`): `NOTE` | `BUG` | `QUESTION` | `IDEA`
- `timestamp` (required): Elapsed seconds from session start (must be a non-negative number)
- `screenshot` (optional): Image file upload (max 10MB)

**Response 201:** Created note object.

### Delete Note

`DELETE /api/projects/:projectId/exploratory-sessions/:sessionId/notes/:noteId`

**Auth:** PROJECT_ADMIN, QA, DEV

Associated screenshot files are also deleted.

**Response 200:** `{ "success": true }`

---

## Approval Workflow

Manage test case approval status and history.

### Get Approval Status & History

`GET /api/projects/:projectId/test-cases/:testCaseId/approval`

**Auth:** Any project member (via `withProjectAccess`)

**Response 200:**
```json
{
  "approvalStatus": "DRAFT",
  "history": [
    {
      "id": 1,
      "fromStatus": "DRAFT",
      "toStatus": "IN_REVIEW",
      "userId": "abc123",
      "userName": "John Doe",
      "comment": null,
      "createdAt": "2026-03-08T10:00:00.000Z"
    }
  ]
}
```

### Perform Approval Action

`POST /api/projects/:projectId/test-cases/:testCaseId/approval`

**Auth:** PROJECT_ADMIN, QA, DEV (via `withProjectRole`)

**Request body:**
```json
{
  "action": "submit_review",
  "comment": "Optional comment (required for reject)"
}
```

**Valid actions and transitions:**

| Action | From Status | To Status | Notes |
|--------|------------|-----------|-------|
| `submit_review` | `DRAFT` | `IN_REVIEW` | Any editor can submit |
| `approve` | `IN_REVIEW` | `APPROVED` | PROJECT_ADMIN or QA only; cannot self-approve |
| `reject` | `IN_REVIEW` | `REJECTED` | PROJECT_ADMIN or QA only; comment required |
| `revert_draft` | `APPROVED`, `REJECTED` | `DRAFT` | Any editor can revert |

**Response 200:**
```json
{
  "approvalStatus": "IN_REVIEW",
  "fromStatus": "DRAFT"
}
```

**Errors:**
- `400` - Invalid action or invalid state transition
- `400` - Missing comment on reject
- `403` - Self-approval attempt or insufficient role
- `404` - Test case not found

---

## Teams

Teams provide an organizational layer above projects. A team groups users under shared ownership, and projects can be assigned to a team.

### Pages

Teams are managed through SvelteKit page routes (form actions), not REST API endpoints:

| Page | Description |
|------|-------------|
| `/teams` | List all teams the current user belongs to |
| `/teams/new` | Create a new team |
| `/teams/:teamId` | Team dashboard — members and assigned projects |
| `/teams/:teamId/settings` | Team settings — rename, description, manage members |

### Schema

**`team` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `name` | text | required |
| `description` | text | optional |
| `created_by` | text FK → user | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | auto-updated |

**`team_member` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `team_id` | integer FK → team | cascade delete |
| `user_id` | text FK → user | cascade delete |
| `role` | enum | `OWNER`, `ADMIN`, `MEMBER` |
| `joined_at` | timestamp | |

Unique constraint on `(team_id, user_id)`.

### Roles

| Role | Permissions |
|------|-------------|
| `OWNER` | Full control — edit team, manage members, assign/remove projects, delete team |
| `ADMIN` | Manage members and project assignments |
| `MEMBER` | View team and assigned projects |

### Project Assignment

Projects are assigned to teams via `project.team_id` (nullable integer FK → team, set null on delete). This is backward compatible — projects without a team continue to work as before. When a project belongs to a team, it appears on the team dashboard and team members gain visibility into the project.
