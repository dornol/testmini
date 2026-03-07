# TODO -- Improvement and Additional Tasks

> Based on codebase analysis (2026-03-02)
> Full re-analysis and Phases 1-3 implementation (2026-03-05)
> Phase 4 implementation (2026-03-05)
> 8 new features implemented (2026-03-05)
> 4 testing items implemented (2026-03-05)
> Phase 4 CI integration implemented (2026-03-05)
> UX improvements -- Data loss prevention (2026-03-05)

---

## Quick Wins ✅

- [x] Add `/api/health` health check endpoint -- includes DB connection verification
- [x] Environment variable validation -- check `BETTER_AUTH_SECRET`, `ORIGIN` at server startup (`DATABASE_URL` already has existing check)
- [x] Unify API route `request.json()` to `parseJsonBody()` utility (16 files, 18 occurrences)
- [x] Warning logging on Redis connection failure -- connect/error events + initial failure message
- [x] Production SvelteKit adapter -- change `adapter-auto` to `adapter-node`

---

## Security

- [x] File storage path traversal protection -- block `objectKey` containing `..` in `storage.ts`
- [x] Add production guide to `.env.example` -- instructions for generating strong secrets
- [x] Add security response headers -- set X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection in `hooks.server.ts`
- [x] Attachment access control -- verify project access permission via referenced entity in `/api/attachments/[id]` GET
- [x] Attachment MIME type whitelist -- restrict allowed file types (images, PDF, documents, videos, etc. ~20 types)
- [x] Redis authentication setup -- add `requirepass` to production compose
- [x] Strengthen encryption key derivation -- switch `crypto.ts` from SHA-256 to PBKDF2 (100,000 iterations)
- [x] Auth endpoint rate limiting -- Redis sliding window per-IP limiting (login/signup 10req/min)
- [x] API rate limiting -- file upload 30req/min, bulk 20req/min, general API 100req/min (hooks.server.ts)
- [x] OIDC token verification hardening -- JWKS-based RS256/384/512 signature verification + discovery SSRF protection (private IP blocking)

---

## UX / Accessibility

- [x] Add skeleton loading for complex pages -- navigation loading indicator (shimmer bar)
- [x] Improve Admin page empty state -- add empty state icons/guidance
- [x] Form label accessibility -- fix missing `<Label for={id}>` and `aria-label`
- [x] Modal/dialog focus trap -- already handled by bits-ui (no additional work needed)
- [x] Enhance delete action success/failure toast feedback -- convert hardcoded error messages to i18n
- [x] Async operation loading states -- project search skeleton + dialog action spinners
- [x] Dashboard chart accessibility -- add `aria-label` + `role="img"` to Canvas charts
- [x] Project layout tab ARIA -- apply `role="tablist"`, `aria-current="page"`
- [x] VirtualList accessibility -- add `role="list"` / `role="listitem"` semantic attributes
- [x] Improve color-dependent status indicators -- add text labels alongside PASS/FAIL progress bars (colorblind support)
- [x] Signup password strength indicator -- PasswordStrengthMeter component (5-level color bar + text labels)

---

## Performance / Refactoring

- [x] Split test case page component -- 2,434 lines to 1,604 lines (34% reduction)
- [x] Test case list pagination info display -- "Page X of Y", total count
- [x] Per-row status on import failure -- detailed results showing which rows succeeded/failed
- [x] Sidebar N+1 query optimization -- consolidate 3 queries to 1 JOIN in `+layout.server.ts`
- [x] Bulk operation batch size limit -- add max 200 item limit to bulk API
- [x] StepsEditor unique ID usage -- change from array index to `crypto.randomUUID()` key
- [x] Split test run detail page component -- 1,157 lines to 188 lines + 6 sub-components (RunHeader, ExecutionFilters, BulkActionBar, ExecutionTable, ExecutionRow, FailureDetailDialog)
- [x] Export endpoint streaming -- ReadableStream + cursor-based pagination (batch of 100), BOM included
- [x] Dashboard chart lazy loading -- LazyChart component (IntersectionObserver + skeleton placeholder)
- [x] Report page date range filter -- preset buttons (7/30/90 days, all) + custom date input, URL parameter based

---

## Deployment / Infrastructure

- [x] Production Dockerfile (multi-stage build)
- [x] `compose.prod.yaml` -- production Docker Compose
- [x] CI/CD pipeline setup -- Gitea Actions (check, test, build)
- [x] Docker network isolation -- separate frontend/backend networks in production compose
- [x] lint/format scripts -- add eslint, prettier, format:check scripts to `package.json`
- [x] Monitoring/logging -- pino structured logging, request ID tracing, error handling hooks, console.* to structured log conversion
- [x] DB backup strategy -- pg_dump automatic backup/restore scripts + Docker Compose cron service (daily at 02:00, 30-day retention)
- [x] Deployment documentation -- write DEPLOY.md (Docker Compose, manual deployment, SSL/reverse proxy, DB backup, troubleshooting)

---

## New Features

- [x] Test run comparison view -- side-by-side comparison of two runs (filters: all/diff/regression)
- [x] Test case version diff view -- word-level LCS diff, per-field change visualization
- [x] Multi test run consolidated export -- CSV export via checkbox selection on report page
- [x] User preferences page -- language/theme DB persistence, cross-device sync
- [x] Audit log -- auditLog table + Admin view page (filters, pagination) + major action logging
- [x] Notification system -- notification table + NotificationBell component (30-second polling, mark as read, cursor pagination)
- [x] Dashboard widget customization -- dashboardLayout table + widget show/hide, drag reorder, size adjustment (sm/md/lg)
- [x] Test case templates -- testCaseTemplate table + "Save as Template" / "Create from Template" UI
- [x] Bulk import progress indicator -- ImportDialog state machine (idle->uploading->processing->complete/error) + result summary card
- [x] Attachment drag and drop upload -- D&D support in AttachmentManager (drag visual feedback, MIME validation, multi-file)
- [x] Keyboard shortcuts -- ShortcutManager + KeyboardShortcuts component (Mod+S save, Mod+K search, ? hint panel)
- [x] Test case comments/discussion -- testCaseComment table + CommentSection component (1-level threading, edit/delete)

---

## DB / Schema

- [x] Add composite index -- `testExecution(testRunId, status, executedBy)` covering index (migration 0006)
- [x] test_execution CHECK constraint -- enforce `executedBy`/`executedAt` NULL when `PENDING` (migration 0006)
- [x] Group color value validation -- add HEX format regex validation in API
- [x] sortOrder value validation -- prevent negative/non-integer values in reorder API
- [x] Attachment referential integrity -- INSERT/UPDATE validation trigger + CASCADE cleanup trigger on parent deletion (migration 0007)

---

## Testing

- [x] API route integration tests -- core API contract verification (projects, test-cases, test-runs, import)
- [x] E2E tests -- core workflow (project creation -> TC creation -> run execution -> result verification)
- [x] New API guard tests -- bulk batch limit, export count limit, reorder validation, group color validation, attachment MIME, etc.
- [x] Svelte component tests -- PasswordStrengthMeter (8), ShortcutHintPanel (9), shortcuts.ts (23) tests added
- [x] API PATCH/DELETE tests -- project (10), TC (15), run (11), group (13) PATCH/DELETE tests added
- [x] Concurrency tests -- soft lock unit (14), lock API (17), revision optimistic concurrency (9) tests added
- [x] E2E coverage expansion -- admin (11), project-settings (9), reports (11) E2E tests added
- [x] Uncovered API test reinforcement -- health (2), attachments (5), preferences (5), clone (8), versions (6), export (8), executions (3), status (5), failures (5), suites (22), audit/notifications utility (10)

---

## Phase 4: CI Integration (PLAN.md)

- [x] Add `automation_key` field to TestCase -- DB schema + composite unique index + TC create/edit UI + API
- [x] Automation result collection API -- `/api/automation/results` POST (API key auth, TC matching, auto run creation, failure details)
- [x] CI webhook integration -- `/api/automation/webhook` POST (GitHub Actions / GitLab CI event ingestion)
- [x] Project API key management -- `projectApiKey` table + create/list/revoke API + settings UI

---

## API Improvements

- [x] Test suite item project membership validation -- verify TC project membership on POST
- [x] Reorder API membership validation -- verify project membership on TC/group reorder
- [x] Export count limit -- max 20 runs on `/reports/export`
- [x] User search pagination -- add offset parameter to `/api/users/search`
- [x] API response consistency -- unify PATCH endpoints from `{success: true}` to returning updated entity
- [x] OIDC discovery caching -- 5-minute TTL memory cache + 10-second fetch timeout

---

## UX Improvements -- Data Loss Prevention

- [x] Unsaved changes warning on form navigation -- UnsavedChangesGuard component (beforeNavigate + beforeunload), applied to TC create/edit/settings pages
- [x] Inline edit change loss prevention -- flushInlineEdit() auto-commits previous edit when starting new edit, resolves race condition
- [x] API key modal warning enhancement -- copy status tracking, close confirmation when not copied, amber warning banner, loading text fix
- [x] Utility function tests -- unsaved-guard.ts (isFormDirty, isInlineEditDirty, shouldWarnOnApiKeyClose) 18 tests
- [x] Inline state change loading indicator -- spinner + duplicate request prevention on priority/assignee/execution status change (test-cases, ExecutionTable, ExecutionRow)
- [x] Bulk action feedback -- success/failure toast + loading spinner in BulkActionBar, dashboard layout save error toast
- [x] Empty state improvements -- filter reset link for TC search empty results, dashboard chart empty state message, reset button for test run filter empty state
- [x] Activity log limit -- dashboard activity log limited to 20 items + "Show more" button
- [x] SSE connection status indicator -- orange "Disconnected" indicator on connection loss (RunHeader)
- [x] Edit lock retry -- show "Retry" button when another user is editing (TC detail page)
- [x] Breadcrumb navigation -- display Project > Test Cases > TC-XXX path on TC detail page
- [x] Group collapse state persistence -- localStorage-based per-project collapse/expand state storage
- [x] Signup password validation -- disable submit button on password mismatch
- [x] Audit log date range validation -- prevent date inversion via min/max attributes on start/end date
- [x] Member role change confirmation -- add AlertDialog confirmation dialog (immediate submit -> confirm then submit)
- [x] Navigation/validation utility tests -- navigation.ts (loadCollapsedGroups, saveCollapsedGroups, isDateRangeValid) 16 tests
- [x] Status dropdown keyboard accessibility -- role="menu"/menuitem, Arrow keys, Escape, auto-focus (ExecutionTable)
- [x] Notification panel Escape key close -- add onkeydown handler to NotificationBell
- [x] Comparison page colorblind support -- regression(▼)/improvement(▲)/change(◆) icons displayed alongside colors
- [x] Notification polling backoff -- 30s to 5min interval on inactive tab, based on visibilitychange event
- [x] Comparison result CSV export -- client-side CSV generation (BOM included, filter-aware)
