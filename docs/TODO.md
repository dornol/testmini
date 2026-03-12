# TODO -- Planned Features and Improvements

> This document tracks upcoming work. Features are organized by priority and grouped by domain.

---

## Current Status Review

The following core capabilities are **already implemented**:

| # | Category | Status | Notes |
|---|----------|--------|-------|
| 1 | Test Case CRUD | Done | Create/edit/delete, steps, preconditions, expected results |
| 2 | Hierarchy & Organization | Done | Groups (sections), tags, drag-and-drop sorting |
| 3 | Version Control | Done | Per-version history, diff viewer, revision-based optimistic locking |
| 4 | Test Runs & Execution | Done | Run creation, execution status (Pass/Fail/Blocked/Skipped), bulk pass, progress tracking |
| 5 | Failure Details | Done | Environment, error message, stack trace, comments per failure |
| 6 | Dashboard & Reporting | Done | Pass/fail rates, per-environment/priority stats, Chart.js charts, CSV export |
| 7 | User & Permission Management | Done | Global roles (ADMIN/USER), project roles (PROJECT_ADMIN/QA/DEV/VIEWER) |
| 8 | File Attachments | Done | Upload/download/delete, linked to test cases |
| 9 | Real-time Sync | Done | SSE for test run execution screen, Redis Pub/Sub |
| 10 | CI/Automation Integration | Done | Automation key, result ingestion API, GitHub Actions/GitLab CI webhooks |
| 11 | REST API | Done | Full CRUD for all entities, API key auth |
| 12 | i18n | Done | Korean + English (paraglide) |
| 13 | OIDC/OAuth SSO | Done | Dynamic IdP management, PKCE, account linking |
| 14 | Custom Priorities | Done | Per-project configurable priorities with colors and ordering |
| 15 | Templates | Done | Test case templates for quick creation |
| 16 | Test Suites | Done | Grouping test cases into reusable suites |
| 17 | Soft Locking | Done | Redis/in-memory edit locking with UI indicators |
| 18 | Bulk Operations | Done | Bulk tag/priority/group/delete/clone for test cases |
| 19 | Import/Export | Done | CSV and JSON import/export for test cases |
| 20 | In-App Notifications | Done | Bell UI, polling, mark as read; triggered by key events |
| 21 | MCP Server | Done | Resources + tools via Streamable HTTP, API key auth |
| 22 | Outgoing Webhooks | Done | Per-project webhook config, Slack/generic HTTP, HMAC signing, event filtering |
| 23 | Issue Tracker Integration | Done | Jira, GitHub, GitLab, Custom webhook; link/create issues from test cases/executions |
| 24 | Custom Fields | Done | Per-project field definitions (text/number/select/date/checkbox/URL), JSONB storage |
| 25 | Execution Comments | Done | Comments on test run executions, inline in execution table |
| 26 | Traceability Matrix | Done | Requirements ↔ test cases mapping, coverage gap analysis, CSV export |
| 27 | Saved Filters & Views | Done | Per-user saved filter presets, quick switching in test case list |
| 28 | Issue Status Sync | Done | Fetch/sync issue status from Jira/GitHub/GitLab, bidirectional links |
| 29 | Report Export | Done | PDF generation, shareable links with tokens, scheduled report emails |
| 30 | Parameterized Tests | Done | Parameters, data sets, CSV import, test run expansion, shared data library |
| 31 | BDD/Gherkin Support | Done | Given/When/Then syntax editor, auto-parse into steps, format toggle |
| 32 | Test Case Approval Workflow | Done | Draft → In Review → Approved/Rejected, approval history, notifications |
| 33 | Exploratory Test Sessions | Done | Timer-based sessions, notes with types, screenshot upload, charter |
| 34 | S3/MinIO Object Storage | Done | Optional S3-compatible backend for file uploads, env-driven with local fallback |
| 35 | Environment Matrix | Done | Per-project configurable environments with colors and ordering, replaces hardcoded enum |
| 36 | Mobile-Optimized Views | Done | Responsive breakpoints, scrollable tabs, column hiding, collapsible settings nav |
| 37 | Test Plans | Done | Separate planning entity with lifecycle (Draft→Approved→Active→Completed), linked test cases and runs |
| 38 | Team/Organization Hierarchy | Done | Teams above projects, OWNER/ADMIN/MEMBER roles, project assignment, backward compatible |

---

## Phase 5: MCP Server

Expose project data via [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) so that AI assistants and external tools can query test cases, runs, and reports programmatically.

### MCP Resources (read-only data)

- [x] `test-cases` -- list all test cases with latest version
- [x] `test-runs` -- list recent test runs with status
- [x] `summary` -- dashboard summary (total test cases, recent runs)
- [x] `projects` -- current project info with counts, members, environments, priorities

### MCP Tools (actions)

- [x] `search-test-cases` -- full-text search across test cases
- [x] `get-test-case` -- get test case detail by ID or key (includes tags)
- [x] `get-test-run` -- get test run with execution status counts
- [x] `get-failures` -- get failure details for a run
- [x] `create-test-case` -- create a new test case with title, steps, priority
- [x] `update-execution-status` -- change execution status (PASS/FAIL/BLOCKED/SKIPPED)
- [x] `update-test-case` -- update an existing test case (creates new version)
- [x] `create-test-run` -- create a test run with selected test cases and environment
- [x] `record-failure-detail` -- record failure environment, error message, stack trace
- [x] `export-run-results` -- export test run results as structured data

### Implementation

- [x] Add MCP server dependency (`@modelcontextprotocol/sdk` v1.27)
- [x] Create MCP server (`src/lib/server/mcp/server.ts`)
- [x] Implement authentication (reuse project API key via Bearer token)
- [x] Register resources and tools
- [x] Web Standard Streamable HTTP transport (`/api/mcp` endpoint)
- [x] Documentation in `docs/API.md`
- [x] Integration tests for MCP endpoints

---

## Phase 6: Issue Tracking Integration & Traceability

Link test results to external issue trackers for end-to-end traceability.

### 6.1 External Issue Tracker Integration

- [x] Provider configuration (per-project settings page)
  - Jira: base URL, API token, project key
  - GitHub Issues: repo, token
  - GitLab Issues: project, token
  - Generic webhook: configurable URL + payload template
- [x] Auto-create issue on test failure (one-click from failure detail)
  - Pre-fill title, description with test case info, failure details, environment
- [x] Link existing issue to test case or execution
  - Store external issue URL/key in separate `issue_link` table
- [x] Display linked issue status (sync from external tracker)
- [x] Bidirectional link: external issue links back to test run/case

### 6.2 Traceability Matrix

- [x] `requirement` table (id, projectId, externalId, title, source)
- [x] `requirement_test_case` mapping table
- [x] Traceability view: requirement -> test cases -> latest execution results
- [x] Coverage gap analysis: requirements without test cases
- [x] Export traceability matrix (CSV)

---

## Phase 7: Advanced Reporting & Analytics

### 7.1 Trend Analysis

- [x] Failure trend chart: failure count over time (by run, by week/month)
- [x] Flaky test detection: tests that alternate Pass/Fail across recent runs
  - Flag flaky tests with indicator badge
  - Flaky test report page
- [x] Test case aging: identify stale test cases not executed recently
- [x] Per-assignee execution statistics

### 7.2 Report Export

- [x] PDF report generation (test run summary, charts, failure details)
- [x] Scheduled report emails (weekly/milestone summary)
- [x] Shareable report links (public read-only view with token)

### 7.3 Saved Filters & Custom Views

- [x] Save filter presets (combination of priority, tag, group, assignee, status)
- [x] Named views per user (e.g., "My failing tests", "Critical unexecuted")
- [x] Quick filter switching in test case list and test run list

---

## Phase 8: Notifications & Collaboration

### 8.1 In-App Notifications

- [x] Notification bell with unread count
- [x] Events: assigned to test case/run, execution status changed, comment added, run completed
- [x] Mark as read / mark all read
- [x] Notification preferences (per-user toggle per event type)

### 8.2 Webhook & External Notifications

- [x] Slack integration (incoming webhook)
  - Run completed summary, failure alerts
- [x] Generic webhook (configurable URL + payload, HMAC signing, per-project settings)
- [x] Email notifications (optional, SMTP config)

### 8.3 Comments & Mentions

- [x] Comments on test cases (already exists) -- extend with @mention support
- [x] Comments on test run executions
- [x] @mention triggers notification to mentioned user

---

## Phase 9: Parameterized Tests & Test Data

### 9.1 Parameterized Test Cases

- [x] Data-driven test case support: define parameter variables in steps (e.g., `{{username}}`, `{{password}}`)
- [x] Data set table: rows of parameter values per test case
- [x] Execution expands parameterized test case into N executions (one per data row)
- [x] Results tracked per parameter combination

### 9.2 Shared Test Data Library

- [x] Project-level reusable data sets (e.g., "Valid Users", "Edge Case Inputs")
- [x] Link data sets to multiple test cases
- [x] Import data sets from CSV

---

## Phase 10: Custom Fields

- [x] Project-level custom field definitions
  - Field types: text, number, dropdown (single/multi), date, checkbox, URL
  - Configurable per project in settings
- [x] Custom fields displayed on test case detail/edit forms
- [x] Custom fields available as filter/search criteria
- [x] Custom field values stored in JSONB column on `test_case_version`
- [x] Custom field columns in test case list view (user-configurable)

---

## Phase 11: Code Quality & Maintenance

### 11.1 TypeScript Error Fixes -- Done

80 type errors fixed (svelte-check: 0 errors):

- [x] `+page.server.ts` dashboard -- typed `unknown[]` → `RecentRun[]`, `TrendRun[]`, `ActivityEntry[]`
- [x] `report-scheduler.spec.ts` -- incomplete mock objects → `as never` cast
- [x] `webhooks/+page.svelte` -- `createdAt` type `string | Date`
- [x] Spec files (6) -- `load()` result type assertions
- [x] `oidc-jwt.spec.ts`, `form-utils.spec.ts`, `TestCaseDetailSheet.svelte`, `[testCaseId]/+page.svelte` -- individual type fixes

### 11.2 Svelte Warnings -- Done

64 warnings fixed (svelte-check: 0 warnings):

- [x] Reactivity: `$derived`, `$effect` sync, `svelte-ignore` for intentional captures (superForm)
- [x] Accessibility: `aria-label`, `tabindex`, `onkeydown` handlers, `for` attributes

### 11.3 Large File Refactoring -- Done

- [x] `test-runs/[runId]/+page.server.ts` (496 → 473 lines) -- extracted `getActionContext`, `requireEditableRun`, `parseFailureFormData`
- [x] `test-cases/+page.server.ts` (387 → 413 lines) -- extracted `loadBatchTags`, `loadBatchAssignees`, `loadExecutionMap`, `applyExecStatusFilter`; parallel loading via `Promise.all`
- [x] `auth/oidc/[slug]/callback/+server.ts` (323 → 353 lines) -- extracted `exchangeToken`, `resolveUserInfo`, `matchOrCreateUser`
- [x] `api/.../test-cases/import/+server.ts` (306 → 258 lines) -- moved `parseCSV` to `$lib/server/csv-utils.ts`
- [x] `test-cases/[testCaseId]/+page.server.ts` (386 lines) -- kept as-is (small focused actions, no duplication)

---

## Phase 12: Test Coverage Expansion

### 12.1 Client Component Tests -- Done

9 `.svelte.spec.ts` files (was 3), 27 component tests added:

- [x] PriorityBadge (3 tests) -- name, color dot, text color
- [x] TagBadge (5 tests) -- name, color, remove button conditional, callback
- [x] AddCircleButton (5 tests) -- button vs span, aria-label, onclick
- [x] CommentForm (6 tests) -- textarea, disabled submit, cancel button, submitting state
- [x] ImportResults (4 tests) -- success/error counts, expandable rows, progress bar
- [x] GherkinEditor (4 tests) -- textarea, preview, keyword colors

### 12.2 E2E Test Expansion -- Done

9 Playwright suites (was 5):

- [x] Test case CRUD workflow (create → edit → version → delete)
- [x] Test run execution flow (create run → start → FAIL → PASS → complete)
- [x] Team/project management workflow (create team → settings → members)
- [x] Import/export roundtrip (export CSV → import CSV → verify)

---

## Phase 13: Performance, Security & Maintenance

### 13.1 Performance Optimizations -- Done

- [x] Requirements N+1 query elimination -- batch `DISTINCT ON` query replaces per-test-case loop (3 endpoints)
  - `requirements/+server.ts` -- coverage calculation
  - `requirements/matrix/+server.ts` -- traceability matrix JSON
  - `requirements/matrix/export/+server.ts` -- traceability matrix CSV
- [x] Test case export tag filter -- `inArray` filter replaces full project tag scan
- [x] Composite index `test_execution(test_case_version_id, id)` for execution lookups

### 13.2 Security Hardening -- Done

- [x] Remove plaintext password logging from admin seed
- [x] JSON body size limit (1MB) via `parseJsonBody()` -- returns 413 if exceeded
- [x] Rate limiting for password change (5/min) and profile updates (20/min)

### 13.3 UX Improvements -- Done

- [x] Replace `console.warn()` with `toast.error()` in member search (project + team)
- [x] Add loading state to password change button

### 13.4 Tech Debt -- Done

- [x] Dependency updates -- svelte, bits-ui, better-auth, svelte-sonner, paraglide, lucide, etc.
- [x] Test mock infrastructure -- `db.execute`, `inArray`, `sql` mocks added

### 13.5 Test Coverage -- Done

140 test files, 1615 tests (was 136 files, 1564 tests):

- [x] Requirements list API (11 tests) -- GET coverage calculation, POST validation
- [x] `parseJsonBody` size limit (7 tests) -- valid JSON, invalid JSON, 413 on oversize, edge cases
- [x] Admin seed (6 tests) -- no plaintext password, default warning, skip when users exist
- [x] Rate limit rule matching (27 tests) -- all 7 rules, priority ordering, method filtering

---

## Phase 14: Monitoring, Accessibility & E2E Coverage

### 14.1 Performance Monitoring -- Done

- [x] Custom Drizzle query logger with execution timing
  - Slow query detection (>500ms threshold) with structured logging
  - Debug-level query logging in development
- [x] Cache hit/miss tracking with `cacheStats()` function
  - Hit rate, miss count, store size metrics
  - Periodic stats logging every 5 minutes via hooks.server.ts

### 14.2 Accessibility Improvements -- Done

- [x] Skip-to-content link (`<a href="#main-content">`) with focus-visible styling
- [x] `<main id="main-content">` landmark for skip-link target
- [x] Sidebar `<nav aria-label="Main navigation">` for screen reader identification
- [x] axe-core integration for automated WCAG 2.1 AA testing

### 14.3 E2E Test Expansion -- Done

13 Playwright suites (was 9), 4 new suites added:

- [x] Dashboard & Navigation (8 tests) -- project dashboard, sidebar navigation, widget rendering
- [x] Bulk Operations (5 tests) -- multi-select, bulk action bar, select all
- [x] Notifications (3 tests) -- bell visibility, notification panel, direct navigation
- [x] Accessibility (8 tests) -- skip-to-content, landmarks, axe-core WCAG checks, keyboard nav, alt attributes

### 14.4 Unit Test Coverage -- Done

141 test files, 1641 tests (was 140 files, 1615 tests):

- [x] Cache stats tracking (12 tests) -- hits, misses, hit rate, counter reset, store size, interleaved ops, delete/prefix exclusions
- [x] Query logger (15 tests) -- slow query detection, threshold boundary, query truncation (200/120 chars), param count, production mode suppression, duration rounding, sub-ms queries, multiple queries

---

## Phase 15: Docker Optimization & Performance Benchmarks

### 15.1 Docker Image Optimization -- Done

- [x] 3-stage build (deps → build → runtime) for better layer caching
  - Stage 1: dependency install with `--mount=type=cache` for pnpm store
  - Stage 2: build + `pnpm deploy --prod` for minimal node_modules (no symlinks, prod-only)
  - Stage 3: runtime with only necessary files
- [x] Pinned pnpm version (`pnpm@10`) instead of `@latest`
- [x] Node.js-based health check (removes wget/curl dependency from runtime image)
- [x] Improved .dockerignore (docs/, .idea/, .vscode/, non-prod scripts)

### 15.2 Performance Benchmark Tooling -- Done

- [x] Benchmark script (`scripts/benchmark.ts`, `pnpm bench`)
  - Sequential benchmark: avg, p50, p95, p99, min, max per endpoint
  - Concurrent load test: 5/10 concurrent workers, RPS measurement
  - Warm-up request before measurement
  - Slow endpoint detection (p95 > 500ms warning)
- [x] Shared statistics utilities (`src/lib/utils/percentile.ts`)
  - `percentile(sorted, p)` -- interpolated percentile calculation
  - `round2(n)` -- round to 2 decimal places
- [x] 16 unit tests for benchmark statistics (percentile + round2)

### 15.3 Benchmarked Endpoints

| Tier | Endpoint | Notes |
|------|----------|-------|
| Critical | Dashboard page | 6+ queries, 5-min cache |
| Critical | Test cases list | Full load, no pagination |
| Critical | Test runs list | Paginated with subqueries |
| High | Bulk operations | Up to 200 items, transactional |
| High | Trends report | Aggregate queries with HAVING |
| High | Requirements matrix | DISTINCT ON, multiple joins |
| Medium | SSE events | Connection scalability |
| Medium | Import/export | Streaming, file processing |

---

## Phase 16: DB Pool Tuning, Bundle Analysis & Lighthouse CI

### 16.1 DB Connection Pool Tuning -- Done

- [x] Explicit postgres.js pool options (was: library defaults only)
  - `max`: 20 (prod) / 10 (dev), configurable via `DB_POOL_MAX`
  - `idle_timeout`: 30s, configurable via `DB_IDLE_TIMEOUT`
  - `connect_timeout`: 10s, configurable via `DB_CONNECT_TIMEOUT`
  - `max_lifetime`: 30 minutes (connection recycling)
  - `prepare`: true (prepared statements for query plan caching)
- [x] Environment variables documented in `.env.example`

### 16.2 Bundle Size Analysis -- Done

- [x] `rollup-plugin-visualizer` integration (`pnpm build:analyze`)
  - Generates treemap HTML report at `build/stats.html`
  - Shows gzip and brotli compressed sizes
  - Only activates when `ANALYZE=true`
- [x] Bundle safety tests (7 tests) -- prevents server-only packages from leaking into client code
  - Guards: @aws-sdk, pdfkit, nodemailer, ioredis, pino, postgres, drizzle-orm
  - Validates devDependencies vs dependencies classification

### 16.3 Lighthouse CI -- Done

- [x] Lighthouse CI configuration (`lighthouserc.cjs`, `pnpm lighthouse`)
  - Desktop preset, 3 runs per URL
  - Performance thresholds: FCP < 2s, LCP < 3s, CLS < 0.1, TBT < 300ms
  - Accessibility threshold: score >= 0.9
  - Results stored locally (`.lighthouseci/`)
- [x] `@lhci/cli` added as devDependency

### 16.4 Test Coverage -- Done

144 test files, 1720 tests (was 142 files, 1657 tests):

- [x] Connection pool config (21 tests) -- pool max (prod/dev defaults, env override, edge cases 0/1), idle timeout, connect timeout, max lifetime, prepared statements, full config snapshots, partial overrides, undefined env values
- [x] Bundle safety (42 tests) -- server-only package scans across critical files and all components, client util server-import checks, database import guards, package.json dependency classification (runtime, client, devOnly, framework), lighthouserc.cjs validation, vite.config.ts visualizer config

---

## Phase 17: Test Coverage Reporting

### 17.1 Coverage Infrastructure -- Done

- [x] `@vitest/coverage-v8` integration (`pnpm test:coverage`)
  - Reporters: text, text-summary, html, json-summary
  - HTML report at `coverage/index.html`
  - Scoped to testable lib code (`src/lib/**/*.ts`, `src/hooks*.ts`)
  - Excludes: Svelte components, paraglide, DB schemas, test helpers, ui primitives
- [x] Global coverage thresholds enforced:
  - Statements: 70%, Branches: 65%, Functions: 70%, Lines: 70%
- [x] Current coverage: 77% statements, 70% branches, 78% functions, 78% lines

### 17.2 High-Coverage Modules

| Module | Stmts | Notes |
|--------|-------|-------|
| `src/lib/utils/*` | 100% | percentile, navigation, unsaved-guard |
| `src/lib/server/db/pool-config.ts` | 100% | Connection pool config |
| `src/lib/server/db/query-logger.ts` | 100% | Query timing/logging |
| `src/lib/server/mcp/server.ts` | 99% | MCP server |
| `src/lib/schemas/*` | 100% | Zod validation schemas |
| `src/lib/server/cache.ts` | 98% | TTL cache with stats |

---

## Phase 18: Column Settings, Custom Field Enhancements & Bug Fixes

### 18.1 Column Settings -- Done

- [x] Column visibility and order settings (project-wide, stored in DB)
  - GET/PUT `/api/projects/:projectId/column-settings`
  - Static columns, custom field columns (`cf_*`), test run columns (`run_*`)

### 18.2 Custom Field Enhancements -- Done

- [x] Inline custom field editing in test case list
- [x] Custom fields in test case creation form
  - `createTestCaseSchema` now includes `customFields`
  - PATCH API supports `customFields` for inline editing (merged with existing values)

### 18.3 Bug Fixes -- Done

- [x] Fix: exploratory session detail page 500 error
- [x] Fix: double unsaved-changes dialog
- [x] Fix: VirtualList bottom cut-off
- [x] Fix: member list table styling

---

## Phase 19: Security Hardening & Bug Fixes

### 19.1 Critical Security Fixes -- Done

- [x] Attachment DELETE IDOR -- added `withProjectAccess` check so users can only delete attachments from projects they belong to
- [x] Custom field PATCH mass assignment -- added allowlist validation so only permitted fields can be updated (prevents arbitrary column overwrites)

### 19.2 High Priority Fixes -- Done

- [x] `queries.ts` `as any` type cast replaced with proper union type for query return values

### 19.3 Medium Priority Fixes -- Done

- [x] Unguarded `fetch` JSON parse -- added `res.ok` checks before `res.json()` in test-run creation and test-case lock check
- [x] `NotificationBell` `$derived` reassignment -- replaced with `$state` + `$effect` sync pattern (cannot reassign `$derived` values)

---

## Phase 20: MCP Server Enhancement

### 20.1 New Resources (7) -- Done

- [x] `tags://list` -- list all project tags
- [x] `test-suites://list` -- list all test suites
- [x] `test-plans://list` -- list all test plans
- [x] `templates://list` -- list all test case templates
- [x] `requirements://list` -- list all requirements
- [x] `custom-fields://list` -- list all custom field definitions
- [x] `exploratory-sessions://list` -- list recent exploratory sessions

### 20.2 New Tools (31) -- Done

**Test Case Management:**
- [x] `delete-test-case` -- delete by ID or key
- [x] `complete-test-run` -- set run status to COMPLETED
- [x] `update-approval-status` -- DRAFT → IN_REVIEW → APPROVED/REJECTED workflow

**Tags (4):**
- [x] `create-tag` -- create new tag
- [x] `delete-tag` -- delete tag by ID
- [x] `add-tag-to-test-case` -- tag a test case
- [x] `remove-tag-from-test-case` -- untag a test case

**Groups (3):**
- [x] `list-groups` -- list test case groups/sections
- [x] `create-group` -- create new group
- [x] `delete-group` -- delete group (unassigns test cases)

**Test Suites (4):**
- [x] `get-test-suite` -- suite detail with test cases
- [x] `create-test-suite` -- create new suite
- [x] `add-suite-items` -- add test cases to suite
- [x] `remove-suite-items` -- remove test cases from suite

**Test Plans (6):**
- [x] `get-test-plan` -- plan detail with test cases
- [x] `create-test-plan` -- create plan with milestone/dates
- [x] `update-test-plan` -- update name/status/milestone/dates
- [x] `add-plan-items` -- add test cases to plan
- [x] `remove-plan-items` -- remove test cases from plan
- [x] `create-run-from-plan` -- generate test run from plan

**Templates (3):**
- [x] `get-template` -- template detail
- [x] `create-template` -- create new template
- [x] `create-test-case-from-template` -- create test case from template

**Requirements & Traceability (3):**
- [x] `create-requirement` -- create new requirement
- [x] `link-requirement-test-case` -- link requirement to test case
- [x] `get-traceability-matrix` -- coverage matrix with stats

**Issue Links (2):**
- [x] `list-issue-links` -- list issue links (filter by test case/execution)
- [x] `create-issue-link` -- link external issue

**Exploratory Sessions (4):**
- [x] `create-exploratory-session` -- start new session
- [x] `get-exploratory-session` -- session detail with notes
- [x] `update-exploratory-session` -- pause/resume/complete
- [x] `add-session-note` -- add note (NOTE/BUG/QUESTION/IDEA)

**Comments (3):**
- [x] `add-test-case-comment` -- comment on test case
- [x] `list-test-case-comments` -- list test case comments
- [x] `add-execution-comment` -- comment on test execution

### 20.3 Test Coverage -- Done

147 test files, 1846 tests (was 144 files, 1720 tests):

- [x] MCP server tests expanded from 56 to 123 tests (67 new)
  - 7 new resource tests (tags, suites, plans, templates, requirements, custom fields, exploratory sessions)
  - 60 new tool tests covering all 31 new tools with success paths and error cases

---

## Phase 21: QA Workflow Enhancements

### 21.1 Retest / Re-run Workflow -- Done

- [x] "Retest Failed" action on test run: create new run with only FAIL/BLOCKED executions from the source run
- [x] Link retest run back to original run (`retestOfRunId` foreign key)
- [x] Before/after comparison view: original result vs retest result side-by-side (API + dialog UI)
- [x] Retest badge/indicator on runs created via retest
- [x] API endpoint: `POST /api/projects/:projectId/test-runs/:runId/retest`
- [x] Retest button in run detail header and run list dropdown
- [x] Retest dialog with FAIL/BLOCKED count display
- [x] i18n messages (en/ko) for retest UI
- [x] 15 unit tests for retest API (auth, 404, 400, success, name, retestOfRunId, environment, createdBy, null filter, execution records, malformed body, single execution, all null versions)

### 21.2 Execution Duration Tracking -- Done

- [x] Add `startedAt` and `completedAt` timestamps to `test_execution` table
- [x] Auto-set `startedAt` on first status change from PENDING
- [x] Auto-set `completedAt` on terminal status (PASS/FAIL/BLOCKED/SKIPPED)
- [x] Display duration per execution in test run detail (Duration column)
- [x] Duration tracking for automation results API
- [x] 27 unit tests for page server (load, updateStatus, failWithDetail, bulkPass, updateRunStatus, deleteFailure -- covering duration tracking, SSE events, notifications, error cases)
- [x] Run-level duration summary (total time, avg per test) -- computed in page.server, displayed as card
- [x] Slowest tests report in analytics -- top 20 by avg execution duration in reports page

### 21.x Test Coverage -- Done

156 test files, 1968 tests (was 147 files, 1846 tests):

- [x] Retest API (15 tests) -- auth (401, 403), not found (404), no failures (400), success, default/custom name, retestOfRunId, environment preservation, createdBy, null version filter, execution records, malformed body, single execution, all-null versions
- [x] Test run detail page server (31 tests) -- load (invalid ID, 404, stats+executions with duration, durationSummary computation, zero durations for PENDING, mixed timestamps, single execution), updateStatus (400, 404, 403, startedAt from PENDING, no startedAt when already started, SSE), failWithDetail (400, 404, startedAt+completedAt, no startedAt when started, dual SSE events), bulkPass (400, 403, startedAt+completedAt, SSE), updateRunStatus (400, IN_PROGRESS startedAt, COMPLETED finishedAt, member notifications, self-exclude, SSE), deleteFailure (400, success)
- [x] Comparison API (7 tests) -- retest comparison data, 400 non-retest, 404 not found, empty comparisons, unchanged results, invalid ID, 401 unauthenticated
- [x] Bulk sync retestMarked (11 tests) -- auth, 404 config, sync success, partial failures, empty links, testCaseId/testExecutionId scoping, retestMarked count on done, retestMarked 0 on non-done, no retest without testCaseId, CUSTOM provider exclusion
- [x] Report data (21 tests) -- parseDateRange (12 tests: all preset, default 30d, start/end of day, custom dates, defaults for missing, invalid strings, null/empty, preset override, normalization), loadReportData (9 tests: 12 stat objects, 12 queries, reversed recentRuns, projectId passing, empty results, allTime range)

### 21.3 Release / Milestone Management -- Done

- [x] `release` table (id, projectId, name, version, status: PLANNING/IN_PROGRESS/READY/RELEASED, targetDate, releaseDate)
- [x] Link test plans and test runs to releases (`releaseId` FK on both tables)
- [x] Release dashboard: aggregated pass rate across all linked runs
- [x] Release readiness view: Go/No-Go verdict with blocking failure details
- [x] Release list page with status filters, release detail page with readiness card
- [x] Link/unlink plans and runs from release detail page
- [x] API: CRUD `/api/projects/:id/releases`, readiness `/api/projects/:id/releases/:id/readiness`
- [x] i18n messages (en/ko) for release UI

### 21.4 Sign-off / Go-No-Go Workflow -- Done

- [x] Sign-off action on test plans (QA/admin approval with comment)
- [x] `test_plan_signoff` table (planId, userId, decision: APPROVED/REJECTED, comment, createdAt)
- [x] Sign-off history and audit trail on plan detail page
- [x] Block plan status transition to COMPLETED without sign-off (configurable per project)
- [x] Sign-off notification to plan creator and project admins
- [x] Project settings toggle for `requireSignoff`
- [x] API: GET/POST `/api/projects/:id/test-plans/:id/signoffs`
- [x] i18n messages (en/ko) for sign-off UI

### 21.5 Retest on Defect Fix (Issue Tracker Sync) -- Done

- [x] When linked issue status syncs to "done", auto-mark related test cases as `retestNeeded = true`
- [x] Retest needed filter toggle in test case list filter bar
- [x] `retestNeeded` boolean column on `test_case` table with partial index
- [x] One-click "Create retest run" API from retest-needed test cases (`POST /api/projects/:id/test-cases/retest-run`)
- [x] Both single-link and bulk-sync endpoints updated to set retest flag
- [x] i18n messages (en/ko) for retest UI
- [x] Defect density report: defects per module/group -- linked issue count by test case group in reports page

### 21.6 Risk-Based Testing -- Done

- [x] Risk level field on test cases (CRITICAL/HIGH/MEDIUM/LOW based on business impact × failure likelihood)
- [x] 4×4 risk matrix computation: `computeRiskLevel(impact, likelihood)` in `src/lib/server/risk-matrix.ts`
- [x] Risk assessment API: `GET/PATCH /api/projects/:id/test-cases/:id/risk`
- [x] Risk matrix aggregation API: `GET /api/projects/:id/risk-matrix`
- [x] i18n messages (en/ko) for risk UI

### 21.7 Test Cycle Management -- Done

- [x] `test_cycle` table (projectId, releaseId, name, cycleNumber, status: PLANNED/IN_PROGRESS/COMPLETED, startDate, endDate)
- [x] Link test runs to cycles (`testCycleId` FK on `test_run`)
- [x] Cycle CRUD API: `GET/POST /api/projects/:id/test-cycles`, `GET/PUT/DELETE .../test-cycles/:id`
- [x] Cycle detail with linked runs, pass rate summary
- [x] i18n messages (en/ko) for cycle UI

### 21.8 Feature/Module Coverage Map -- Done

- [x] `module` table (projectId, name, parentModuleId for hierarchy, description, sortOrder)
- [x] `module_test_case` join table (many-to-many link)
- [x] Module CRUD API: `GET/POST /api/projects/:id/modules`, `PUT/DELETE .../modules/:id`
- [x] Module test case link/unlink API: `POST/DELETE .../modules/:id/test-cases`
- [x] Module coverage API: `GET /api/projects/:id/modules/coverage` (per-module pass/fail counts)
- [x] i18n messages (en/ko) for module UI

### 21.9 Environment Cross-Matrix -- Done

- [x] Cross-environment run creation API: `POST /api/projects/:id/test-runs/cross-env` (creates N runs, one per environment)
- [x] Environment matrix report API: `GET /api/projects/:id/reports/env-matrix?runIds=1,2,3`
- [x] Per-environment pass rate comparison
- [x] Environment-specific failure pattern detection (tests that fail in some envs but pass in others)
- [x] i18n messages (en/ko) for cross-env UI

### 21.x Test Coverage (Phase 21.6-21.9) -- Done

172 test files, 2105 tests (was 162 files, 2019 tests):

- [x] Risk matrix unit tests (28 tests) -- 16 matrix combinations, null/invalid edge cases, isValidRiskLevel, riskSortOrder
- [x] Risk schema validation (4 tests) -- valid input, null clear, invalid level, all enum values
- [x] Risk API (8 tests) -- GET/PATCH risk, 404, 400 invalid ID, null clear, auth
- [x] Test cycle schema (9 tests) -- create/update validation, missing fields, invalid status
- [x] Test cycle API (6 tests) -- list, create, duplicate number 409, missing fields, auth
- [x] Test cycle detail API (7 tests) -- GET with runs/summary, 404, PUT update, empty update 400, DELETE
- [x] Module schema (8 tests) -- create/update validation, null parent, name limits
- [x] Module API (6 tests) -- list, create with/without parent, missing name, empty name, auth
- [x] Cross-env run schema (5 tests) -- valid input, optional fields, <2 envs, empty testCaseIds
- [x] Cross-env run API (5 tests) -- create multi-env runs, <2 envs, empty IDs, no valid TCs, auth

---

## Phase 22: Performance & UX Improvements

### 22.1 Query Parallelization -- Done

- [x] Test plan detail page: 7 sequential queries → single `Promise.all` (`+page.server.ts`)
- [x] Test plan API GET: 3 sequential queries → single `Promise.all` (`+server.ts`)
- [x] Release detail page: 5 sequential queries → single `Promise.all` (`+page.server.ts`)

### 22.2 Database Indexes -- Done

- [x] `test_run(project_id, created_at)` -- optimizes test run list ordering
- [x] `test_run(project_id, status)` -- optimizes status filtering on test run list
- [x] Migration: `drizzle/0037_test_run_indexes.sql`

### 22.3 Report Data Caching -- Done

- [x] 5-minute TTL cache for `loadReportData()` results (12 parallel aggregate queries)
- [x] Cache key based on projectId + date range

### 22.x Test Coverage -- Done

161 test files, 2005 tests (was 156 files, 1968 tests):

- [x] Report data caching (5 new tests) -- cache hit returns data without DB query, cache miss stores result, cache key generation for allTime vs date range, TTL verification
- [x] Release detail page server (10 new tests) -- 404, creator name, GO/NO_GO/CAUTION verdict logic, multi-run stats aggregation, empty creator fallback, 5 parallelized queries verification
- [x] Test plan detail page server (7 new tests) -- 404, creator name, empty creator fallback, items/runs/signoffs/releases, requireSignoff true/false, 7 parallel queries
- [x] Test plan list page server (3 new tests) -- plans list, empty plans, itemCount/runCount from subqueries
- [x] Test run list page server (8 new tests) -- pagination meta, empty runs, status filter, custom page/limit, limit clamping (1-50), page clamping, totalPages calculation
- [x] Exploratory session detail page server (5 new tests) -- invalid session ID 400, 404, session with notes/creator, empty notes, DB failure 500

### 22.4 Console Statement Cleanup -- Done

- [x] Removed 9 `console.error`/`console.warn` statements from production code
- [x] Server-side: removed unused error variable captures in exploratory session handlers (3 files)
- [x] Client-side: replaced `console.warn` with `toast.error()` for user-facing feedback (NotificationBell, FailureDetailsSheet, TestCaseDetailSheet)
- [x] Polling failures kept silent (no toast for background refresh)

### 22.5 UX Loading State Improvements -- Done

- [x] Release detail page: link plan/run buttons disabled during save with loading text (`linkSaving` state)
- [x] Exploratory session detail: pause/resume buttons disabled during save to prevent double-clicks (`actionSaving` state)

---

## Phase 23: Search & Detail Sheet Enhancements

### 23.1 Test Case Search Improvement -- Done

- [x] Search now uses ILIKE contains matching for both key and title (was key-only)
- [x] Combined with existing full-text search (FTS) via OR for best coverage
- [x] Partial string matching works for non-English text (Korean, etc.)

### 23.2 Test Case Detail Sheet Enhancement -- Done

- [x] "Open Full Page" link button to navigate to full detail/edit page
- [x] Approval status badge display in sheet header
- [x] Automation key display section
- [x] Gherkin/BDD step format rendering with keyword coloring (Given/When/Then/And/But)
- [x] Tabbed Comments/Attachments section at bottom of sheet
- [x] Custom fields display

### 23.x Test Coverage -- Done

162 test files, 2019 tests (was 161 files, 2005 tests):

- [x] Test case filters updated (36 tests, was 27) -- title ILIKE in search, special char fallback, whitespace search, retestNeeded filter
- [x] Tags API endpoint (10 tests) -- create tag, assign to test case, duplicate handling, validation, auth, name trimming

---

## Phase 24: UX Audit & Polish

### 24.1 Navigation & Feedback Improvements -- Done

- [x] Dashboard: replace `window.location.href` with SvelteKit `goto()` for client-side navigation (recent runs table)
- [x] Dashboard: add toast notification on layout save (was silently saving with no feedback)
- [x] Dashboard: add empty state card for "Recent Runs" widget when no runs exist (was rendering nothing)

### 24.2 Confirmation Dialogs for Destructive Actions -- Done

- [x] Admin projects: add `AlertDialog` confirmation before activating/deactivating projects (was direct form submit)
- [x] Traceability: add `AlertDialog` confirmation before unlinking a test case from a requirement (was instant with no undo)

### 24.3 UI Consistency -- Done

- [x] Exploratory sessions: replace raw `<table>` with shadcn `Table.*` components (matching all other list pages)
- [x] Exploratory sessions: add responsive column hiding (`hidden sm:table-cell`, `hidden md:table-cell`, `hidden lg:table-cell`)
- [x] Exploratory sessions: improve empty state with icon, styled dashed border container, and CTA button (matching test-runs, test-suites, releases pattern)
- [x] Traceability: add loading spinner to page loading state (was plain text only)

### 24.4 Accessibility -- Done

- [x] Add `aria-label` and `aria-hidden="true"` to all dropdown menu action trigger buttons (test-runs, test-plans, test-suites, releases -- 4 pages)
- [x] Add `aria-label` to column reorder buttons in test case list (up/down move buttons)
- [x] svelte-check warnings reduced from 12 to 6 (all remaining are pre-existing autofocus/state_referenced_locally)

### 24.5 i18n -- Done

- [x] New messages (en/ko): `common_saved`, `dashboard_layout_saved`, `req_unlink_confirm`, `admin_confirm_toggle_title`, `admin_confirm_activate`, `admin_confirm_deactivate`

### 24.6 Traceability Dialog Fixes -- Done

- [x] Remove double Portal/Overlay wrapping from all traceability page dialogs (Create, Edit, Delete, Unlink, Link Test Case)
- [x] Link test case dialog: widen to `max-w-2xl` with `max-h-[85vh]` overflow containment
- [x] Link test case dialog: add infinite scroll (load 50 more on scroll) replacing fixed 50-item limit
- [x] Add traceability page server load test (6 tests)

---

## Future Considerations

| Feature | Priority | Notes |
|---------|----------|-------|
| Bulk execution via CLI | Low | `testmini exec --run 123` for headless execution recording |
