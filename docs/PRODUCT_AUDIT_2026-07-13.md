# TestMini product audit — 2026-07-13

## Executive summary

TestMini already covers the expected feature set of a mature QA management product. The next return on investment is not another broad feature area; it is making the existing surface easier to discover, safer to operate, and cheaper to maintain.

Current verification:

- `pnpm check`: 0 errors, 0 warnings
- `pnpm lint`: passed
- `pnpm test:unit --run`: 4,947 tests passed in 289 files
- `pnpm build`: passed, including alongside `check` and unit tests
- `pnpm db:check`: all 48 migrations registered
- `pnpm audit --prod`: no known vulnerabilities
- `pnpm test:e2e`: 98 passed, 1 intentionally skipped
- Browser coverage: desktop/mobile layout, accessibility, authentication, administration, CRUD, settings, reports, import/export, My Work, and the complete execution workflow passed

## Implementation progress

Completed after the audit:

- Production audit reduced from 62 vulnerabilities (15 high) to zero known vulnerabilities, with a high-severity CI gate in both regular and release workflows.
- Paraglide generation is protected by a cross-process lock; concurrent `check`, `test`, and `build` now complete without deleting each other's generated files.
- Global shell, notifications, shortcuts, attachments, import results, pagination, dialogs, dashboard chart labels, and related accessibility text are localized in Korean and English.
- Project navigation was reduced from 12 flat tabs to primary destinations plus Design, Execute, and Analyze workflow groups.
- The command palette is visible from the header and now supports project switching and quick creation actions in addition to entity search.
- Heavy test-case overlays are lazy-loaded and isolated in `TestCaseOverlays.svelte`. The test-case list client entry fell from 216.64 kB to 135.60 kB (about 37%), while the server page entry fell from 314.34 kB to 165.39 kB (about 47%).
- Project lists now show recently created projects first, and E2E project creation waits for a concrete project ID instead of matching the creation form URL.
- Playwright pins the Better Auth origin to its configured base URL, making authentication setup independent of each developer's local network origin.
- Core axe checks now fail on serious as well as critical violations. The command palette implements combobox/listbox semantics, traps focus, and restores focus to its trigger; the header shortcut contrast violation is fixed.
- Dashboard layout customization was extracted into `DashboardCustomizer.svelte`, reducing the dashboard page from 781 to 528 lines. Its state persistence and localized switch UI have focused component coverage.
- Production builds enforce budgets for total client JavaScript (1,980,000 bytes), the largest client chunk (195,000 bytes), and the largest route node (140,000 bytes).
- Reviewed visual baselines cover Korean/light and English/dark dashboards, the customization state, and the Korean mobile empty test-case state. The full suite compares these screenshots in CI.
- My Work is available from the global sidebar and command palette. It aggregates assigned cases, permission-scoped approvals, pending executions, mentions, failures, retests, and due-soon plans; supports type, project, and priority URL filters; and provides exact entity deep links plus localized loading, empty, error, accessible, and responsive states.

## P0 — do before adding features

### 1. Patch production dependency vulnerabilities

`pnpm audit --prod` currently reports 15 high-severity findings. Directly relevant paths include SvelteKit/adapter-node request-size handling, Vite development-server file access, MCP transitive routing/URI packages, S3 XML parsing, and superforms' `effect` dependency.

Acceptance criteria:

- Upgrade direct dependencies and refresh the lockfile.
- Add `pnpm audit --prod --audit-level high` to CI.
- Re-run unit, build, API, upload-size, MCP, and S3 integration tests.
- Document any remaining accepted transitive risk with reachability and mitigation.

### 2. Make i18n generation concurrency-safe

Running `check`, `test`, and `build` concurrently caused Paraglide generation to fail with `ENOTEMPTY`, temporarily removing `src/lib/paraglide/runtime`. A standalone build succeeds, so this is a shared generated-directory race rather than a product compile failure.

Acceptance criteria:

- Generate messages once in a dedicated pre-CI step, or generate into per-process temporary output and atomically replace it.
- Ensure `check`, `test`, and `build` do not each mutate the same directory.
- Add a CI job that exercises the intended parallel command layout.

### 3. Finish Korean/English coverage, including accessibility text

Only 97 of 222 Svelte files import Paraglide. Some untranslated user-visible strings are in global, frequently used components: sidebar/header ARIA labels, notifications, shortcut help, attachment upload, import results, pagination, chart labels, and the root redirect page.

Acceptance criteria:

- Move global visible text, empty states, toasts, ARIA labels, and screen-reader-only text into message catalogs.
- Add a static check for raw user-facing strings outside an explicit allowlist.
- Test both locales on login, projects, test cases, runs, reports, notifications, and settings.

## P1 — highest usability return

### 4. Redesign project navigation around workflows

The project layout exposes 12 horizontal tabs: dashboard, cases, suites, plans, cycles, releases, runs, reports, quality, exploratory, traceability, and settings. Horizontal scrolling prevents overflow but does not solve discoverability or cognitive load. The sidebar shows only cases, runs, and reports, so global and project navigation tell different stories.

Recommended grouping:

- Design: Cases, Suites, Plans, Traceability
- Execute: Cycles, Releases, Runs, Exploratory
- Analyze: Dashboard, Reports, Quality
- Configure: Settings

Keep the most-used destinations visible and move the remainder into grouped menus. Persist recent/favorite destinations per user.

### 5. Turn the command palette into true global navigation

`Mod+K` only searches after entering a project and only after two characters. It does not provide commands when empty and cannot switch projects or jump to settings/admin areas.

Add:

- Project/team switching from anywhere
- Empty-query actions: new case, new run, import, settings, shortcuts
- Recent pages and recent entities
- Search result grouping and matched-text highlighting
- A visible search affordance in the header so the feature is discoverable without knowing the shortcut

### 6. Add role-based onboarding and contextual empty states

The product has many capabilities but no visible guided path connecting them. Add a dismissible project checklist tailored by role:

- Admin: members → environments/priorities → integrations
- QA: import/create cases → suite/plan → first run
- Developer: assigned failures → linked issue → retest
- Viewer: dashboard → reports → shared report

Each empty state should explain why the page matters, offer one primary action, and link to sample/import options.

### 7. Unify cross-entity context

Test plans, releases, cycles, runs, requirements, issues, and cases exist as separate surfaces. Add a consistent context header and backlinks so users can answer “where did I come from?” and “what is this connected to?” without opening several tabs.

Recommended additions:

- Breadcrumbs on detail pages
- Relationship chips (release, cycle, plan, suite, requirement, issue)
- A compact activity timeline on case/run/release details
- Preserve filters and scroll position when returning to lists

### 8. Improve notification workflow

Notifications are a polling panel with mark-as-read behavior. Make it an operational inbox:

- Filter unread / mentions / assignments / failures
- Group by project and day
- Mark individual/all items read with undo
- Deep-link to the exact comment, execution, or approval
- Optional browser push/email digest based on existing preferences

## P1 — maintainability and performance

### 9. Split the largest UI boundaries

Several files are beyond a practical review/test boundary:

- Test-case list page: 2,174 lines
- Test-case detail sheet: 1,840 lines
- Test-case detail page: 1,646 lines
- Report charts: 1,090 lines
- Traceability page: 873 lines

Extract workflow components and state modules, not arbitrary visual fragments. Prioritize filters/query synchronization, bulk selection/actions, detail editing, version/approval state, and report chart configuration. Add focused component tests around each extracted state boundary.

### 10. Reduce initial client payload on heavy pages

The production build shows large client chunks, including roughly 222 KB for one route node and 188/168/111 KB shared chunks before compression. The server-rendered test-case list entry is also the largest page entry.

Actions:

- Capture route-level bundle analysis in CI and set regression budgets.
- Dynamically import detail-sheet-only editors, diff UI, attachments, and charts.
- Confirm virtualization is active at realistic case/execution counts.
- Measure interaction latency for filter changes, opening details, and bulk selection with seeded bulk data.

### 11. Strengthen accessibility assertions

Existing axe tests fail only on `critical` issues; `serious` violations are logged but accepted. Chart containers are excluded. Keyboard coverage only counts that several elements receive focus.

Acceptance criteria:

- Fail on both critical and serious violations for core routes.
- Add accessible summaries/tables for charts rather than excluding them wholesale.
- Test dialog focus trap/restore, mobile sidebar focus, command palette combobox semantics, data-table sorting, and error announcement.
- Verify at 200% zoom and with reduced motion.

### 12. Add full visual regression coverage

Current layout regression checks horizontal overflow on five routes at desktop/mobile and attaches screenshots without comparing them. Expand to screenshot assertions for the main layouts, empty/loading/error states, dialogs/sheets, both themes, Korean/English, and tablet width.

## P2 — targeted feature additions

### 13. Personal work queue

Add a “My Work” landing page combining assigned cases, pending approvals, executions waiting on the user, mentions, linked failures, stale/flaky cases owned by the user, and upcoming plan/release deadlines. This turns many existing features into one daily workflow.

### 14. Release readiness workspace

Build a decision-focused view on top of existing releases, cycles, plans, risk, traceability, signoff, and retest data:

- Blocking failures and unresolved critical issues
- Requirement coverage gaps
- Required environment completion
- Flaky/high-risk exceptions
- Signoff checklist and immutable decision snapshot

### 15. Saved dashboards and shared views

Dashboard widgets are configurable, but teams also need named dashboard presets and project-default views. Allow admins to publish a default, users to clone/personalize it, and shared report links to use a selected view.

### 16. Integration health center

Webhooks, issue trackers, SMTP, storage, Redis, OIDC, and scheduled reports are configured in different places. Add a read-only health overview with last success/failure, latency, retry status, and a permission-gated test action. Never display secrets.

### 17. Data lifecycle controls

Add retention and archive policies for audit logs, notifications, webhook delivery logs, attachments, exploratory screenshots, and completed runs. Include storage usage by project, safe preview, export-before-delete, and audit events.

## Recommended delivery order

1. Security dependency upgrade and CI audit gate.
2. Concurrency-safe i18n generation and untranslated global components.
3. Navigation grouping plus visible/global command palette.
4. “My Work” and role-based onboarding using existing data.
5. Refactor and lazy-load the test-case surfaces before extending them.
6. Release readiness workspace and integration health center.
7. Data lifecycle controls and expanded visual/accessibility regression.

## Success metrics

- Time from new project to first completed run
- Median clicks from login to assigned failure or approval
- Search success rate and zero-result rate
- Percentage of users who use at least three major workflows per week
- Core Web Vitals and interaction latency on bulk seed data
- Serious/critical accessibility violation count
- Production dependency vulnerabilities by severity
- Webhook/report/integration failure recovery time
