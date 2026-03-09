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

## Future Considerations

| Feature | Priority | Notes |
|---------|----------|-------|
| Bulk execution via CLI | Low | `testmini exec --run 123` for headless execution recording |
| GraphQL API | Low | Alternative to REST for flexible querying |
| AI-assisted test case generation | Low | Generate test cases from requirements or code changes using LLM |
