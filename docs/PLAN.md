# TestMini -- Detailed Implementation Plan

> Detailed implementation plan for all phases. TestMini is a minimal QA management system -- simplicity first, no unnecessary complexity.

---

## Frontend Architecture

### UI Component Library

**shadcn-svelte** is used.

- Radix UI-based accessible components
- Integrated with TailwindCSS utility classes
- Copy-paste approach -- component source included within the project
- Path: `src/lib/components/ui/` (shadcn default output path)

**Core components used:**

| Component        | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| Button           | All action buttons                               |
| Input / Textarea | Text input                                       |
| Select           | Dropdown selection (priority, role, status)       |
| Table            | Data lists (test case, run, member)              |
| Dialog           | Confirmation/input modals (failure detail, etc.) |
| Sheet            | Side panels (version history, etc.)              |
| DropdownMenu     | Context menus (row actions)                      |
| Badge            | Status display (PASS/FAIL, priority)             |
| Tabs             | Tab switching (test case detail)                 |
| Card             | Project cards, dashboard widgets                 |
| Pagination       | Pagination                                       |
| Sonner (Toast)   | Notification messages                            |
| Tooltip          | Help text, truncated text display                |
| Skeleton         | Loading placeholders                             |
| AlertDialog      | Dangerous action confirmation (e.g., delete)     |
| Command          | Search/command palette (future extension)        |

### Theme and Dark Mode

- **Light / Dark mode** support
- `class` strategy (`<html class="dark">`)
- System preference detection (`prefers-color-scheme`) + manual toggle
- Theme state: stored in `localStorage`, passed via cookie for server rendering
- Uses shadcn-svelte CSS variable-based theme system
- Color palette: shadcn default theme (customizable)

### Form Handling

**sveltekit-superforms + zod** is used.

- Integrated server/client bidirectional validation
- Natural integration with SvelteKit form actions
- Type-safe validation with zod schemas
- Automatic error message binding

```
zod schema (shared)
    +-- server: validation in form actions
    +-- client: real-time validation + error display via superforms
```

**Validation schema location:** `src/lib/schemas/`

| File                   | Contents                              |
| ---------------------- | ------------------------------------- |
| `project.schema.ts`    | Project create/update schema          |
| `test-case.schema.ts`  | Test case/version schema              |
| `test-run.schema.ts`   | Test run/execution schema             |
| `auth.schema.ts`       | Login/registration schema             |
| `member.schema.ts`     | Member add/role change schema         |

### State Management

- **Component local state**: Svelte 5 runes (`$state`, `$derived`)
- **Page data**: SvelteKit `load` functions (`+page.server.ts` / `+page.ts`)
- **Form state**: managed by superforms
- **Global state** (when needed): Svelte 5 `$state` + context API
  - Authenticated user info: layout `load` -> passed down via context
  - Theme settings: managed with `$state` rune

> Svelte stores (`writable`, `readable`) are not used.
> Unified on Svelte 5 runes.

### Layout Structure

```
+----------------------------------------------------------+
| Header                                                    |
| [Logo] [Project Select] [Search]  [Lang] [Theme] [User]  |
+--------+-------------------------------------------------+
| Side   | Main Content                                     |
| bar    |                                                  |
|        |                                                  |
| [Proj] |  +---------------------------------------------+ |
| [TC]   |  | Page Content                                | |
| [Run]  |  |                                             | |
| [Set]  |  |                                             | |
|        |  +---------------------------------------------+ |
|        |                                                  |
+--------+-------------------------------------------------+
```

- **Header**: Fixed top, project switching, search, user menu
- **Sidebar**: Project context navigation, collapsible/expandable
- **Main**: Scrollable content area
- **Auth pages**: Center layout without sidebar

### Responsive Design

- **Desktop** (>=1024px): Sidebar + main content
- **Tablet** (768~1023px): Sidebar overlay (toggle)
- **Mobile** (<768px): Sidebar hidden, hamburger menu
- Uses TailwindCSS breakpoints (`sm`, `md`, `lg`, `xl`)

### Loading and Error States

- **Page loading**: SvelteKit `+loading.svelte` (future) or `{#await}`
- **Component loading**: shadcn `Skeleton` component
- **Form submission**: Button disabled + spinner
- **Error pages**: `+error.svelte` (404, 403, 500)
- **Toast notifications**: Success/failure feedback (Sonner)
- **Empty state**: Guidance message + CTA when no data available

### Accessibility

- Leverages ARIA attributes from shadcn-svelte components
- Keyboard navigation support
- Focus management (modal open/close)
- Sufficient color contrast (including dark mode)
- Screen reader compatible labels

---

## Phase 1: MVP

Phase 1 consists of 7 Milestones.
Each Milestone targets an independently functional unit.

---

### Milestone 1: Foundation (Auth, DB, Layout)

Auth schema finalization, domain table creation, common layout setup.

#### 1.1 Auth Schema Generation

- [x] Run `pnpm auth:schema` -> generate `src/lib/server/db/auth.schema.ts`
- [x] Verify better-auth tables via `pnpm db:push`
- [x] Remove demo `task` table (delete from `schema.ts`)

#### 1.2 Domain Schema Definition (Drizzle)

All tables are defined in `src/lib/server/db/schema.ts`.

- [x] Enum type definitions
  - `project_role`: PROJECT_ADMIN, QA, DEV, VIEWER
  - `global_role`: ADMIN, USER
  - `priority`: ~~enum~~ migrated to `text` column with `priority_config` table (per-project custom priorities)
  - `environment`: DEV, QA, STAGE, PROD
  - `run_status`: CREATED, IN_PROGRESS, COMPLETED
  - `execution_status`: PENDING, PASS, FAIL, BLOCKED, SKIPPED
  - `reference_type`: TESTCASE, EXECUTION, FAILURE
- [x] `project` table
- [x] `project_member` table
- [x] `test_case` table
- [x] `test_case_version` table (steps JSONB)
- [x] `test_run` table
- [x] `test_execution` table
- [x] `test_failure_detail` table
- [x] `attachment` table
- [x] Index creation
  - `test_case(project_id)`
  - `test_case_version(test_case_id, version_no DESC)`
  - `test_execution(test_run_id, status)`
  - `attachment(reference_type, reference_id)`
- [x] `pnpm db:generate` -> generate migration files
- [x] `pnpm db:push` -> verify DB reflection

#### 1.3 Global Role Extension

- [x] Decide approach for adding `role` column to better-auth `user` table
  - Option A: Use better-auth plugin (`admin` plugin, etc.)
  - Option B: Extend via separate `user_profile` table
- [x] Implement chosen approach

#### 1.4 shadcn-svelte and Theme Setup

- [x] Initialize shadcn-svelte (`pnpm dlx shadcn-svelte@latest init`)
- [x] Dark mode setup (class strategy)
  - Theme toggle component (`src/lib/components/ThemeToggle.svelte`)
  - `localStorage` + cookie-based theme persistence
- [x] Install core components
  - `pnpm dlx shadcn-svelte@latest add button input textarea select table dialog sheet dropdown-menu badge tabs card pagination sonner tooltip skeleton alert-dialog`
- [x] Install sveltekit-superforms + zod
  - `pnpm add sveltekit-superforms zod`
- [x] Create validation schema directory (`src/lib/schemas/`)

#### 1.5 Common Layout and Navigation

- [x] App shell layout (`src/routes/+layout.svelte`)
  - Header: logo, project switching, search, language/theme/user menu
  - Sidebar: project navigation (collapsible/expandable, responsive)
  - Main: scrollable content area
- [x] `src/routes/+layout.server.ts` -- load session/user info
- [x] Redirect handling for unauthenticated users
- [x] Auth-only layout (`src/routes/auth/+layout.svelte`) -- center layout
- [x] Error pages (`src/routes/+error.svelte`) -- 404, 403, 500
- [x] Register Sonner (Toast) provider

#### 1.6 Auth Pages

- [x] `src/routes/auth/login/+page.svelte` -- login form (superforms + zod)
- [x] ~~`src/routes/auth/register/+page.svelte`~~ -- removed (self-registration disabled; enterprise OIDC-only)
- [x] `src/routes/auth/pending/+page.svelte` -- pending approval waiting page (for unapproved OIDC users)
- [x] `src/lib/schemas/auth.schema.ts` -- login validation schema
- [x] better-auth client setup (`src/lib/auth-client.ts`)
- [x] Verify login/logout functionality
- [x] OIDC provider addition -> completed with custom OAuth/PKCE handler in Milestone 11

---

### Milestone 2: Project Management (Project CRUD, Member Management)

#### 2.1 Project API

- [x] `src/routes/api/projects/+server.ts`
  - GET -- project list (pagination, filter)
  - POST -- project creation (ADMIN or authenticated user)
- [x] `src/routes/api/projects/[projectId]/+server.ts`
  - GET -- project detail
  - PATCH -- project update (PROJECT_ADMIN)
  - DELETE -- project deactivation (PROJECT_ADMIN)
- [x] Input validation (`src/lib/schemas/project.schema.ts`, zod)
- [x] Permission check middleware / utility functions

#### 2.2 Project UI

- [x] `src/routes/projects/+page.svelte` -- project list
  - Card or table format
  - Search, filter (active/inactive)
  - Create button
- [x] `src/routes/projects/new/+page.svelte` -- project creation form
- [x] `src/routes/projects/[projectId]/+layout.svelte` -- project detail layout
  - Project navigation (TestCase, TestRun, Settings)
- [x] `src/routes/projects/[projectId]/+page.svelte` -- project dashboard (simple summary)
- [x] `src/routes/projects/[projectId]/settings/+page.svelte` -- project settings

#### 2.3 Member Management

- [x] `src/routes/projects/[projectId]/settings/members/+page.server.ts`
  - Member list query
  - Add member (PROJECT_ADMIN) -- form action
  - Change role -- form action
  - Remove member -- form action
- [x] `src/routes/projects/[projectId]/settings/members/+page.svelte` -- member management UI
  - Member list table
  - Role change dropdown (shadcn Select)
  - Member invite/remove

---

### Milestone 3: Test Case Management (Test Cases, Version Control)

#### 3.1 Test Case API

- [x] `src/routes/api/projects/[projectId]/test-cases/+server.ts`
  - GET -- test case list (search, filter)
  - POST -- test case creation (auto-generated key: TC-0001)
- [x] `src/routes/api/projects/[projectId]/test-cases/[testCaseId]/+server.ts`
  - GET -- test case detail (includes latest version + versions)
  - PATCH -- inline edit (key, title, priority)
  - PUT -- full update (revision check)
  - DELETE -- test case deletion
- [x] Version history (included in GET response)
- [x] Auto key generation logic (per-project sequence)
- [x] Additional APIs: clone, bulk, reorder, lock, tag assign/remove

#### 3.2 Test Case UI

- [x] `src/routes/projects/[projectId]/test-cases/+page.svelte` -- list
  - Integrated table (key, title, priority, tags, status columns)
  - Search (title, key)
  - Filter (priority, tag, group, createdBy)
  - Inline editing (key, title, priority)
  - Group management + DnD sorting
  - Sheet detail panel
  - Bulk actions (tags, priority, group move, delete, clone)
  - Test run columns + status change
- [x] `src/routes/projects/[projectId]/test-cases/new/+page.svelte` -- creation form
  - title, precondition, steps (dynamic add/remove/sort), expected_result, priority
- [x] `src/routes/projects/[projectId]/test-cases/[testCaseId]/+page.svelte` -- detail
  - Display current version content
  - Edit mode toggle
  - Version history side panel
  - Tag management
  - Attachment management
- [x] Steps editor component (`StepsEditor.svelte`)
  - Add/remove rows
  - Each row: action, expected input

#### 3.3 Optimistic Lock Handling

- [x] Revision check on save -> conflict detection
- [x] Soft lock (Redis or in-memory) (`src/lib/server/lock.ts`)
- [x] Lock status UI display (show editing user)

---

### Milestone 4: Test Run & Execution

#### 4.1 Test Run API

- [x] `src/routes/api/projects/[projectId]/test-runs/+server.ts`
  - GET -- test run list
  - POST -- test run creation (select test cases -> batch create executions)
- [x] `src/routes/api/projects/[projectId]/test-runs/[runId]/+server.ts`
  - GET -- test run detail (includes execution list)
  - PATCH -- status change (IN_PROGRESS, COMPLETED)
- [x] `src/routes/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/status/+server.ts`
  - PUT -- record execution result (status)

#### 4.2 Test Run UI

- [x] `src/routes/projects/[projectId]/test-runs/+page.svelte` -- run list
  - Table (name, environment, status, progress, created_by, dates)
- [x] `src/routes/projects/[projectId]/test-runs/new/+page.svelte` -- run creation
  - Name, environment setting (shadcn Select)
  - Test case selection (checkboxes + filter)
- [x] `src/routes/projects/[projectId]/test-runs/[runId]/+page.svelte` -- execution screen
  - Execution list table
  - Color coding by status
  - Inline status change (PASS/FAIL/BLOCKED/SKIPPED)
  - Bulk Pass feature
  - Progress display (progress bar)
  - Failure detail modal on FAIL click

---

### Milestone 5: Failure Detail

#### 5.1 Failure Detail API

- [x] Failure detail API implementation
  - Record failure detail (POST)
  - Query failure detail (GET)
- [x] `src/lib/schemas/failure.schema.ts` -- validation schema

#### 5.2 Failure Detail UI

- [x] Failure detail input modal on FAIL status transition
  - failure_environment, test_method, error_message, stack_trace, comment
- [x] Failure detail view (displayed within execution detail)

---

### Milestone 6: File Attachment

#### 6.1 Storage Setup

- [x] Local file system-based storage implementation (`src/lib/server/storage.ts`)
  - Note: Uses local storage instead of MinIO/S3 (S3 migration possible later)

#### 6.2 Attachment API

- [x] `src/routes/api/attachments/+server.ts`
  - POST -- file upload + metadata save
- [x] `src/routes/api/attachments/[attachmentId]/+server.ts`
  - GET -- file download
  - DELETE -- file deletion

#### 6.3 Attachment UI

- [x] File upload/management component (`src/lib/components/AttachmentManager.svelte`)
  - File upload
  - File list display
  - File download/delete
- [x] Attachment feature integrated into TestCase detail screen

---

### Milestone 7: i18n and Finalization

#### 7.1 Message Definitions

- [x] Define all UI text in `messages/ko.json`, `messages/en.json`
  - auth (login, registration, logout)
  - project (project, members, settings)
  - test-case (test case, version, editing)
  - test-run (test run, execution, status)
  - failure (failure detail)
  - common (buttons, confirm, cancel, delete, pagination)
  - validation (required input, format errors)

#### 7.2 Cleanup and Quality

- [x] Verify i18n applied to all screens
- [x] Error handling consistency check
- [x] Responsive layout verification (mobile/desktop)
- [x] Write tests for key features

---

## Phase 2: Real-time & Dashboard

### Milestone 8: Redis Integration (Optional)

- [x] Add Redis service to `compose.yaml` (optional)
- [x] Redis client setup (`src/lib/server/redis.ts`) with in-memory fallback
- [x] Soft Lock implementation (`src/lib/server/lock.ts`, TestCase edit locking) — Redis or in-memory
- [x] Lock status UI display (show editing user)

### Milestone 9: SSE Real-time Sync

- [x] SSE (Server-Sent Events) server implementation (`/api/projects/[projectId]/test-runs/[runId]/events`)
- [x] Redis Pub/Sub integration
- [x] Client SSE connection management (`src/lib/sse.svelte.ts`)
- [x] TestRun execution screen real-time sync

### Milestone 10: Dashboard & Reporting

- [x] Project dashboard (`src/routes/projects/[projectId]/+page.svelte`)
  - Overall pass rate / failure rate
  - Per-environment statistics, per-priority statistics
  - Recent run status
- [x] Reports page (`src/routes/projects/[projectId]/reports/+page.svelte`)
  - Chart.js-based charts (`src/lib/components/Chart.svelte`)
- [x] CSV export (`/api/projects/[projectId]/test-runs/[runId]/export`)
- [x] Global Admin panel (`src/routes/admin/`)
  - Project management
  - User management

---

## Phase 3: Identity & Advanced Features

### Milestone 11: Dynamic IdP Management (Dynamic OIDC/OAuth Management)

Allows admins to add/edit/delete external IdPs (Keycloak, Google, GitHub, etc.) at runtime as an Identity Broker feature.

#### 11.1 OIDC Provider Schema

- [x] `oidc_provider` table definition (`src/lib/server/db/schema.ts`)
  - `id`, `name` (display name), `slug` (unique identifier, URL-safe)
  - `provider_type`: OIDC, OAUTH2
  - `client_id`, `client_secret_encrypted` (AES-256-GCM encrypted storage)
  - `issuer_url` (OIDC Discovery endpoint)
  - `authorization_url`, `token_url`, `userinfo_url` (for manual configuration)
  - `scopes` (default: `openid profile email`)
  - `enabled` (active/inactive)
  - `auto_register` (auto-create account on authentication)
  - `icon_url` (login button icon)
  - `display_order` (login page display order)
  - `created_at`, `updated_at`
- [x] `oidc_account` table definition (external IdP <-> internal user linking)
  - `id`, `user_id` (FK -> user), `provider_id` (FK -> oidc_provider)
  - `external_id` (user ID / sub claim from IdP)
  - `email`, `name` (info received from IdP)
  - `created_at`, `updated_at`
  - UNIQUE(`provider_id`, `external_id`)
- [x] DB migration applied (`drizzle/0001_aromatic_black_queen.sql`)

#### 11.2 OIDC Provider Management (Admin)

- [x] `src/routes/admin/oidc-providers/+page.server.ts` -- Provider list load + toggle/delete actions
- [x] `src/routes/admin/oidc-providers/+page.svelte` -- Provider list table UI
- [x] `src/routes/admin/oidc-providers/new/+page.server.ts` -- Provider creation action
- [x] `src/routes/admin/oidc-providers/new/+page.svelte` -- Provider creation form (including Discovery)
- [x] `src/routes/admin/oidc-providers/[providerId]/+page.server.ts` -- Provider update/delete actions
- [x] `src/routes/admin/oidc-providers/[providerId]/+page.svelte` -- Provider edit form UI
- [x] `src/routes/api/admin/oidc-providers/discover/+server.ts` -- OIDC Discovery endpoint
- [x] `src/routes/admin/+layout.svelte` -- Added "Identity Providers" tab
- [x] Client secret encryption utility (`src/lib/server/crypto.ts`, AES-256-GCM)

#### 11.3 Custom OAuth Handler (PKCE)

- [x] `src/routes/auth/oidc/[slug]/+server.ts` -- Authorization redirect
  - Read provider config from DB
  - Generate PKCE (code_verifier/code_challenge S256)
  - Generate state parameter (CSRF token)
  - Store encrypted in cookie (5-minute expiry)
  - Redirect to IdP authorization endpoint
- [x] `src/routes/auth/oidc/[slug]/callback/+server.ts` -- Callback handling
  - State verification, code_verifier recovery
  - Authorization code -> token exchange (PKCE)
  - ID token decode (JWT payload base64 parsing)
  - Profile query from userinfo endpoint
  - Account matching: oidcAccount -> email matching -> auto_register
  - Insert directly into better-auth session table + set cookie
  - Block banned users
  - Link mode support (link account to existing session)

#### 11.4 Login/Register Page Integration

- [x] `src/routes/auth/login/+page.server.ts` -- Load active provider list
- [x] `src/routes/auth/login/+page.svelte` -- OIDC provider buttons + divider display
- [x] `src/routes/auth/register/+page.server.ts` -- Load active provider list
- [x] `src/routes/auth/register/+page.svelte` -- OIDC provider buttons + divider display

#### 11.5 Account Linking Management (User)

- [x] `src/routes/auth/account/+page.server.ts` -- Load linked accounts list + unlink action
- [x] `src/routes/auth/account/+page.svelte` -- Linked account management UI
- [x] Email-based automatic account matching (link to existing account if same email)
- [x] Minimum 1 authentication method retention validation

#### 11.6 i18n

- [x] `messages/en.json` / `messages/ko.json` -- Added 30+ OIDC-related messages

---

### Milestone 12: Search and Performance

- [x] Test case full-text search
- [x] Virtual scrolling for execution screen
- [x] Query optimization and index tuning
- [x] Test case bulk import/export (CSV/JSON)

---

## Phase 4: Automation

### Milestone 13: CI Integration

- [x] Add `automation_key` field to TestCase
- [x] Automation result ingestion API (`/api/automation/results`)
- [x] CI webhook integration (GitHub Actions, GitLab CI)

### Milestone 14: Custom Priorities & Inline Tag Creation

#### 14.1 Custom Priorities

Priorities were migrated from a PostgreSQL enum (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) to a per-project configuration table (`priority_config`). Each project can define its own priority levels with custom names, colors, and display order.

- [x] `priority_config` table (id, projectId, name, color, position, isDefault, createdBy, createdAt)
- [x] Migration: `drizzle/0018_custom_priorities.sql` (ALTER columns to text, CREATE TABLE, seed defaults for existing projects)
- [x] Schema: `src/lib/schemas/priority.schema.ts` (createPrioritySchema, updatePrioritySchema)
- [x] Server queries: `loadProjectPriorities()` in `src/lib/server/queries.ts`
- [x] Layout-level data loading: `projectPriorities` available to all child pages via `[projectId]/+layout.server.ts`
- [x] Settings page: `src/routes/projects/[projectId]/settings/priorities/+page.server.ts` and `+page.svelte`
  - CRUD actions (create, update, delete, reorder)
  - Color palette picker, name input, isDefault checkbox
  - Name change propagates to test_case_version and test_case_template
- [x] `PriorityBadge` component (`src/lib/components/PriorityBadge.svelte`) — colored inline badge
- [x] All UI updated to use `PriorityBadge` with dynamic colors from `projectPriorities`:
  - test-cases list, detail, new, filter bar, bulk action bar
  - test-runs new, execution row/table, compare
  - test-suites detail, reports, version diff dialog, detail sheet
- [x] API endpoints updated: priority type changed from enum to string
- [x] Default priority seeding on project creation (both form and API)

### Milestone 15: Outgoing Webhooks

Per-project outgoing webhook configuration for Slack and generic HTTP endpoints. Webhooks fire automatically when notification events occur, using the existing `createNotification()` integration point.

- [x] `project_webhook` table (id, projectId, name, url, secret, events, enabled, createdBy, createdAt)
- [x] Migration: `drizzle/0019_project_webhooks.sql`
- [x] Webhook delivery: `src/lib/server/webhooks.ts` (HMAC-SHA256 signing, 10s timeout, fire-and-forget)
- [x] Integration: `createNotification()` triggers `sendProjectWebhooks()` for project-scoped notifications
- [x] API endpoints: CRUD at `/api/projects/:projectId/webhooks`, test endpoint at `.../test`
- [x] Settings UI: `src/routes/projects/[projectId]/settings/webhooks/+page.svelte`
- [x] i18n: Korean + English messages for all webhook UI strings
- [x] Tests: Unit tests for webhook delivery, API endpoint tests for CRUD/test, notification integration tests

### Milestone 16: MCP Tools Expansion & Notification Preferences

#### 16.1 MCP Server — Additional Tools

Four new tools added to `src/lib/server/mcp/server.ts` (total: 10 tools):

- [x] `update-test-case` — update existing test case by creating a new version, preserving unchanged fields
- [x] `create-test-run` — create a test run with selected test cases or all, with environment selection
- [x] `record-failure-detail` — record failure details (error message, stack trace, environment) on an execution
- [x] `export-run-results` — export complete run results with status counts, executions, and failure details

#### 16.2 Notification Preferences

Per-user notification preferences allowing users to control which in-app notifications they receive.

- [x] `notificationSettings` JSONB column on `user_preference` table (`enableInApp`, `mutedTypes`)
- [x] Migration: `drizzle/0020_notification_preferences.sql`
- [x] `createNotification()` checks user preferences before DB insert (webhooks always fire)
- [x] Preferences API (`/api/users/me/preferences`) updated with validation for notification settings
- [x] Profile page UI: toggle for global enable/disable + per-type checkboxes (6 types)
- [x] i18n: Korean + English messages for notification preference UI
- [x] Tests: 6 notification preference tests, 3 preferences API tests

### Milestone 17: Email Notifications, Trend Analysis & @Mentions

#### 17.1 Email Notifications (SMTP)

Optional SMTP-based email notifications. Fire-and-forget — never blocks or throws.

- [x] `src/lib/server/email.ts` — nodemailer utility (`isEmailConfigured`, `sendEmail`)
- [x] Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- [x] `createNotification()` sends email after DB insert (looks up user email, sends if SMTP configured)
- [x] Tests: 3 email tests with mutable env mock pattern

#### 17.2 Trend Analysis & Flaky Test Detection

- [x] Flaky test detection: SQL `HAVING` clause identifies tests with both PASS and FAIL in date range
- [x] Flaky tests table in reports page with distribution bar and pass/fail counts
- [x] Top failing test cases chart (existing) enhanced with date range filtering

#### 17.3 @Mention Support in Comments

- [x] `extractMentions()` parses `@name` from comment content
- [x] Matches mentioned names against project members (case-insensitive)
- [x] `MENTION` notification type — skips already-notified users (assignee dedup via `notifiedUserIds` Set)
- [x] Comment form hint text for @mention usage
- [x] MENTION added to notification preference toggles
- [x] i18n: Korean + English messages for mentions and trends
- [x] Tests: 2 mention notification tests

#### 14.2 Inline Tag Creation

Tags can now be created directly from the tag assignment UI on test case detail pages, without navigating to the settings page.

- [x] `createTag` form action in `src/routes/projects/[projectId]/test-cases/[testCaseId]/+page.server.ts`
  - Creates tag and assigns to test case in one action
  - If tag name already exists in project, just assigns the existing tag
- [x] Inline tag creation UI: Popover with search input, color palette picker, and "Create" button
- [x] i18n keys: `tag_create_inline`, `tag_new_inline`

---

## Directory Structure (Target)

```
src/
+-- routes/
|   +-- +layout.svelte              # App shell (Header + Sidebar + Main)
|   +-- +layout.server.ts           # Session/user load
|   +-- +error.svelte               # Error pages (404, 403, 500)
|   +-- +page.svelte                # Home (-> project list redirect)
|   +-- auth/
|   |   +-- +layout.svelte          # Center layout (no sidebar)
|   |   +-- login/+page.svelte
|   |   +-- pending/+page.svelte    # Approval queue waiting page
|   |   +-- account/+page.svelte    # Account linking management
|   |   +-- oidc/[slug]/            # OIDC auth flow
|   |       +-- +server.ts          # Authorization redirect
|   |       +-- callback/+server.ts # Callback handling
|   +-- admin/                       # Global Admin panel
|   |   +-- +layout.svelte
|   |   +-- projects/+page.svelte
|   |   +-- users/+page.svelte
|   |   +-- oidc-providers/          # OIDC Provider management
|   |       +-- +page.svelte         # Provider list
|   |       +-- new/+page.svelte     # Provider creation
|   |       +-- [providerId]/+page.svelte  # Provider editing
|   +-- projects/
|   |   +-- +page.svelte            # Project list
|   |   +-- new/+page.svelte        # Project creation
|   |   +-- [projectId]/
|   |       +-- +layout.svelte      # Project layout
|   |       +-- +page.svelte        # Project dashboard
|   |       +-- reports/+page.svelte # Reports (Chart.js)
|   |       +-- settings/
|   |       |   +-- +page.svelte    # Project settings
|   |       |   +-- members/+page.svelte
|   |       |   +-- priorities/+page.svelte  # Custom priority management
|   |       +-- test-cases/
|   |       |   +-- +page.svelte    # List (integrated table, DnD, groups, bulk)
|   |       |   +-- new/+page.svelte
|   |       |   +-- [testCaseId]/+page.svelte
|   |       +-- test-runs/
|   |           +-- +page.svelte    # List
|   |           +-- new/+page.svelte
|   |           +-- [runId]/+page.svelte
|   +-- api/
|       +-- projects/...
|       +-- attachments/...
|       +-- admin/oidc-providers/   # OIDC Discovery API
|       |   +-- discover/+server.ts
|       +-- automation/...          # Phase 4
+-- lib/
|   +-- components/
|   |   +-- ui/                     # shadcn-svelte components (generated)
|   |   +-- ThemeToggle.svelte      # Dark mode toggle
|   |   +-- Sidebar.svelte          # Sidebar
|   |   +-- Header.svelte           # Header
|   |   +-- AttachmentManager.svelte # File attachment management
|   |   +-- StepsEditor.svelte      # Test step editor
|   |   +-- TagBadge.svelte         # Tag badge
|   |   +-- PriorityBadge.svelte   # Priority badge (colored, per-project)
|   |   +-- Chart.svelte            # Chart.js wrapper
|   +-- schemas/                    # zod validation schemas
|   |   +-- auth.schema.ts
|   |   +-- project.schema.ts
|   |   +-- test-case.schema.ts
|   |   +-- test-run.schema.ts
|   |   +-- failure.schema.ts
|   |   +-- tag.schema.ts
|   |   +-- priority.schema.ts
|   |   +-- member.schema.ts
|   +-- server/
|   |   +-- auth.ts                 # better-auth configuration
|   |   +-- crypto.ts               # AES-256-GCM encryption utility
|   |   +-- storage.ts              # Local file storage
|   |   +-- redis.ts                # Redis client + Pub/Sub
|   |   +-- lock.ts                 # Soft lock (Redis or in-memory)
|   |   +-- db/
|   |       +-- index.ts            # Drizzle instance
|   |       +-- schema.ts           # Domain schema
|   |       +-- auth.schema.ts      # better-auth schema (generated)
|   +-- auth-client.ts              # better-auth client
|   +-- sse.svelte.ts               # SSE client wrapper
|   +-- paraglide/                  # Paraglide generated files
|   +-- index.ts
+-- app.d.ts
```

---

## Conventions

### API Patterns

- Use SvelteKit `+server.ts` (API routes)
- RESTful URL structure
- Response format: unified `{ data, error?, meta? }`
- Errors: use SvelteKit `error()` function
- Input validation: zod schema + superforms (shared between server/client)

### DB Patterns

- Use Drizzle ORM query builder
- Migrations: `drizzle-kit generate` -> `drizzle-kit migrate`
- Soft delete: `active` flag (no physical deletion)

### Component Patterns

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- No Svelte stores -- unified on runes
- UI components: shadcn-svelte (`src/lib/components/ui/`)
- Custom components: `src/lib/components/` (outside ui)
- TailwindCSS utility classes
- Dark mode: `class` strategy, CSS variable-based theme
- All `<select>` -> shadcn Select component (bits-ui portal rendering)

### Form Patterns

- sveltekit-superforms + zod
- Validation schemas: `src/lib/schemas/*.schema.ts`
- Server: use `superValidate()` in form actions
- Client: real-time validation + error binding via `superForm()`
- Error messages: use i18n message keys

### Test Patterns

- Server logic: `*.spec.ts` (Vitest, node)
- Components: `*.svelte.spec.ts` (Vitest + Playwright)
- Minimum 1 assertion per test required
