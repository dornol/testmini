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

---

## Phase 5: MCP Server

Expose project data via [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) so that AI assistants and external tools can query test cases, runs, and reports programmatically.

### MCP Resources (read-only data)

- [x] `test-cases` -- list all test cases with latest version
- [x] `test-runs` -- list recent test runs with status
- [x] `summary` -- dashboard summary (total test cases, recent runs)
- [ ] `projects` -- list all projects the caller has access to (future: multi-project API key)

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
- [ ] Integration tests for MCP endpoints

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

- [ ] Data-driven test case support: define parameter variables in steps (e.g., `{{username}}`, `{{password}}`)
- [ ] Data set table: rows of parameter values per test case
- [ ] Execution expands parameterized test case into N executions (one per data row)
- [ ] Results tracked per parameter combination

### 9.2 Shared Test Data Library

- [ ] Project-level reusable data sets (e.g., "Valid Users", "Edge Case Inputs")
- [ ] Link data sets to multiple test cases
- [ ] Import data sets from CSV

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

## Future Considerations

Items below are lower priority or dependent on user demand:

| Feature | Priority | Notes |
|---------|----------|-------|
| Test case approval workflow (Draft -> Review -> Approved) | Medium | Useful for regulated industries; adds review gate before test cases become active |
| BDD/Gherkin support | Medium | Given/When/Then syntax editor; auto-parse into steps |
| Exploratory test session recording | Medium | Timer-based session with free-form notes, screenshots, charter |
| Test plan as separate entity | Low | Currently test runs serve this purpose; separate "plan" adds planning phase before execution |
| Environment matrix | Low | Define environments centrally, run same suite across multiple environments |
| Mobile-optimized views | Low | Responsive is done; dedicated mobile UX for field testers |
| S3/MinIO file storage migration | Low | Replace local file storage with object storage |
| Team/Organization hierarchy | Low | Multi-team structure above projects |
| Test case review/approval workflow | Low | Separate from execution -- review test case content changes |
| Bulk execution via CLI | Low | `testmini exec --run 123` for headless execution recording |
| GraphQL API | Low | Alternative to REST for flexible querying |
| AI-assisted test case generation | Low | Generate test cases from requirements or code changes using LLM |
