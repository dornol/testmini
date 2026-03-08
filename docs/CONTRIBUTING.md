# Contributing Guide

This document covers everything you need to start contributing to testmini — a minimal SvelteKit-based test case management application. The project values simplicity and minimalism: avoid unnecessary complexity, keep solutions focused, and prefer the simplest approach that works.

---

## Table of Contents

1. [Development setup](#development-setup)
2. [Project structure overview](#project-structure-overview)
3. [Code conventions](#code-conventions)
   - [Svelte 5 runes](#svelte-5-runes)
   - [TypeScript](#typescript)
   - [UI components (shadcn-svelte / bits-ui)](#ui-components)
   - [Tailwind CSS v4](#tailwind-css-v4)
4. [Testing guide](#testing-guide)
   - [Unit test patterns with vitest](#unit-test-patterns-with-vitest)
   - [Using mock-db](#using-mock-db)
   - [Using mock-event](#using-mock-event)
   - [Using fixtures](#using-fixtures)
5. [How to add a new API route](#how-to-add-a-new-api-route)
6. [How to add a new page](#how-to-add-a-new-page)
7. [How to add i18n messages](#how-to-add-i18n-messages)
8. [Database changes with Drizzle ORM](#database-changes-with-drizzle-orm)
9. [Git commit conventions](#git-commit-conventions)
10. [Pull request process](#pull-request-process)

---

## Development Setup

### Prerequisites

- Node.js 24 or later
- pnpm 9 or later (`npm install -g pnpm`)
- Docker (for PostgreSQL; Redis is optional)

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd testmini

# 2. Install dependencies
pnpm install

# 3. Start the database (Redis and MinIO are optional)
pnpm db:start          # docker compose up

# 4. Push the database schema
pnpm db:push           # drizzle-kit push (applies schema without migrations)

# 5. Copy and configure environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL and Better Auth secrets
# Optional: REDIS_URL (in-memory fallback), S3_BUCKET+S3_ENDPOINT (local filesystem fallback)

# 6. Start the development server
pnpm dev               # http://localhost:5173
```

### Available scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server with HMR |
| `pnpm build` | Production build |
| `pnpm preview` | Preview the production build locally |
| `pnpm check` | Run svelte-check and TypeScript type checking |
| `pnpm check:watch` | Watch mode for svelte-check |
| `pnpm test` | Run all unit tests once |
| `pnpm test:unit` | Run unit tests in watch mode |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier (write) |
| `pnpm format:check` | Prettier (check) |
| `pnpm db:push` | Push schema changes to database |
| `pnpm db:generate` | Generate migration files |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Drizzle Studio in the browser |
| `pnpm auth:schema` | Regenerate `auth.schema.ts` from Better Auth config |

---

## Project Structure Overview

```
testmini/
├── src/
│   ├── app.d.ts                    # TypeScript ambient declarations (App.Locals, etc.)
│   ├── app.html                    # HTML shell
│   ├── hooks.server.ts             # Server hooks — auth session, rate limiting, logging
│   │
│   ├── lib/
│   │   ├── components/             # Shared Svelte components
│   │   ├── dashboard-widgets.ts    # Dashboard widget definitions and defaults
│   │   ├── gherkin-parser.ts       # BDD/Gherkin step parser (Given/When/Then)
│   │   ├── schemas/                # Zod validation schemas (shared between server and client)
│   │   │   ├── project.schema.ts
│   │   │   ├── test-run.schema.ts
│   │   │   ├── test-suite.schema.ts
│   │   │   ├── failure.schema.ts
│   │   │   ├── tag.schema.ts
│   │   │   ├── priority.schema.ts
│   │   │   ├── environment.schema.ts
│   │   │   ├── test-plan.schema.ts
│   │   │   ├── team.schema.ts
│   │   │   └── member.schema.ts
│   │   ├── server/                 # Server-only code (never imported by client components)
│   │   │   ├── api-key-auth.ts     # API key generation and verification
│   │   │   ├── audit.ts            # Audit log helper
│   │   │   ├── auth.ts             # Better Auth configuration
│   │   │   ├── auth-utils.ts       # requireAuth, requireProjectRole helpers
│   │   │   ├── cache.ts            # In-memory TTL cache (branding, tags, members, priorities, environments, dashboard, notifications)
│   │   │   ├── crypto.ts           # Server-side crypto utilities
│   │   │   ├── csv-utils.ts        # CSV formatting and response helpers
│   │   │   ├── db/
│   │   │   │   ├── index.ts        # Drizzle ORM client (db)
│   │   │   │   ├── schema.ts       # All Drizzle table definitions
│   │   │   │   └── auth.schema.ts  # Better Auth-generated user/session tables
│   │   │   ├── queries.ts          # Shared query helpers (loadProjectTags, loadProjectEnvironments, etc.)
│   │   │   ├── lock.ts             # Distributed lock (Redis or in-memory)
│   │   │   ├── logger.ts           # Pino logger
│   │   │   ├── api-handler.ts     # withProjectAccess / withProjectRole wrappers
│   │   │   ├── email.ts           # SMTP email sending (nodemailer)
│   │   │   ├── errors.ts          # badRequest, notFound, conflict helpers
│   │   │   ├── issue-tracker.ts   # External issue tracker (Jira/GitHub/GitLab)
│   │   │   ├── mcp/               # MCP (Model Context Protocol) server
│   │   │   │   └── server.ts      # MCP server factory (scoped per project)
│   │   │   ├── notifications.ts    # Notification creation helpers (also triggers webhooks)
│   │   │   ├── pdf-report.ts      # PDF report generation (pdfkit)
│   │   │   ├── report-data.ts     # Shared report data loading helpers
│   │   │   ├── report-scheduler.ts # Scheduled report emails (node-cron)
│   │   │   ├── webhooks.ts         # Outgoing webhook delivery (HMAC signing, fire-and-forget)
│   │   │   ├── oidc-jwt.ts         # OIDC JWT verification
│   │   │   ├── rate-limit.ts       # Rate limiter (Redis or in-memory)
│   │   │   ├── redis.ts            # Optional Redis client and pub/sub
│   │   │   ├── storage.ts          # File storage abstraction (local filesystem or S3/MinIO)
│   │   │   ├── test-case-filters.ts # Test case SQL filter condition builder
│   │   │   └── test-helpers/       # Test utilities (never imported in production code)
│   │   │       ├── fixtures.ts     # Shared test data objects
│   │   │       ├── mock-db.ts      # Drizzle mock factory
│   │   │       └── mock-event.ts   # SvelteKit RequestEvent mock
│   │   └── types/
│   │       └── events.ts           # Shared event type definitions (SSE payloads, etc.)
│   │
│   └── routes/
│       ├── +layout.server.ts       # Root layout: load session, user preferences
│       ├── +layout.svelte          # Root layout component
│       ├── api/                    # All REST API route handlers (+server.ts files)
│       │   ├── admin/
│       │   ├── attachments/
│       │   ├── automation/
│       │   ├── health/
│       │   ├── mcp/               # MCP Streamable HTTP endpoint
│       │   ├── notifications/
│       │   ├── projects/          # Includes webhooks/, exploratory-sessions/, approval/, test-plans/ endpoints
│       │   └── users/
│       ├── auth/                   # Login, pending approval, OAuth callback pages
│       ├── admin/                  # Admin panel pages (global admin only)
│       ├── account/                # User account/profile pages
│       ├── teams/                  # Team management pages (list, new, detail, settings)
│       └── projects/               # Project pages
│           └── [projectId]/
│               ├── +layout.server.ts   # Load project, user role
│               ├── test-cases/
│               ├── test-runs/
│               ├── test-plans/
│               ├── test-suites/
│               ├── exploratory/
│               ├── reports/
│               └── settings/
│
├── docs/                           # Documentation (this directory)
├── e2e/                            # Playwright end-to-end tests
├── drizzle/                        # Drizzle migration files
├── compose.prod.yaml               # Docker Compose for production
├── drizzle.config.ts               # Drizzle Kit config
├── svelte.config.js
├── tailwind.config.ts              # (Tailwind v4 uses CSS config — see app.css)
├── tsconfig.json
└── vite.config.ts
```

---

## Code Conventions

### Svelte 5 Runes

All new Svelte components must use Svelte 5 rune syntax. Do not use the old `$:` reactive labels, `export let` props syntax, or `createEventDispatcher`.

**State**
```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

**Props**
```svelte
<script lang="ts">
  interface Props {
    title: string;
    onClose?: () => void;
  }
  let { title, onClose }: Props = $props();
</script>
```

**Effects**
```svelte
<script lang="ts">
  $effect(() => {
    document.title = title;
  });
</script>
```

**Children (slots replacement)**
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
```

**Events** — use callback props, not `createEventDispatcher`:
```svelte
<!-- Good -->
<Button onclick={() => handleClick()} />

<!-- Good — pass callback as prop -->
let { onSave }: { onSave: (data: FormData) => void } = $props();
```

### TypeScript

- All files use strict TypeScript (`"strict": true` in `tsconfig.json`)
- Prefer explicit return types on exported functions
- Use `unknown` instead of `any` where possible
- Zod schemas live in `src/lib/schemas/` and are the canonical shape definition for API request/response data
- Server-only types (Drizzle row types, auth types) stay inside `src/lib/server/`
- Import path alias: `$lib` → `src/lib`

### UI Components

The project uses `bits-ui` (headless primitives) and a shadcn-svelte style component library. Shared components are in `src/lib/components/`.

When adding a new UI element:
1. Check `src/lib/components/` for an existing component before creating a new one
2. Use `bits-ui` primitives for accessible interactive elements (dialog, dropdown, etc.)
3. Apply styles with Tailwind utility classes using `clsx` and `tailwind-merge` (via the `cn()` helper) for conditional classes
4. Use `lucide-svelte` for icons

**`cn()` helper pattern:**
```svelte
<script lang="ts">
  import { cn } from '$lib/utils';
  let { class: className } = $props();
</script>

<div class={cn('base-classes', className)}>
```

### Tailwind CSS v4

This project uses Tailwind CSS v4 with Vite plugin (`@tailwindcss/vite`). Configuration is CSS-native — there is no `tailwind.config.ts`. Custom design tokens are defined as CSS custom properties in `src/routes/layout.css`.

Do not use v3 configuration patterns like `theme.extend` in a JS config file.

### Responsive Design

The app uses a mobile-first responsive strategy with these breakpoints:

| Breakpoint | Width | Usage |
|---|---|---|
| (default) | < 640px | Mobile phones — minimal columns, stacked layouts |
| `sm:` | ≥ 640px | Large phones — show key column, checkboxes |
| `md:` | ≥ 768px | Tablets — show priority, progress bar; settings sidebar appears |
| `lg:` | ≥ 1024px | Desktop — sidebar static, show tags/assignees/run columns |
| `xl:` | ≥ 1280px | Wide desktop — show all columns (updatedBy, custom fields) |

**Key patterns:**
- **Navigation tabs** (`[projectId]/+layout.svelte`): Horizontal scroll with `overflow-x-auto scrollbar-none`, `shrink-0` on each tab
- **Settings layout** (`settings/+layout.svelte`): `flex-col` on mobile → `md:flex-row` with sidebar
- **Table column hiding**: Use `hidden sm:table-cell`, `hidden md:table-cell`, etc. on both `<Table.Head>` and `<Table.Cell>`
- **Dashboard grid**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- **Main padding**: `px-2 sm:px-4` (tighter on mobile)
- **Scrollbar hiding**: Use the `scrollbar-none` utility class (defined in `layout.css`)

---

## Testing Guide

Tests use **Vitest**. Test files are co-located with the source files they test and follow the naming pattern `*.spec.ts` or `*.api.spec.ts`.

Run tests:
```bash
pnpm test          # all tests, once
pnpm test:unit     # watch mode
```

### Unit Test Patterns with Vitest

A basic test file structure:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('myFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does the expected thing', () => {
    expect(myFunction(input)).toBe(expected);
  });
});
```

### Using mock-db

`src/lib/server/test-helpers/mock-db.ts` provides a Drizzle-compatible mock that supports the chainable fluent API (`db.select().from().where()...`).

```typescript
import { vi } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';

// In your test file
vi.mock('$lib/server/db', () => ({ db: createMockDb() }));

import { db } from '$lib/server/db';

// Control what a select query resolves to
mockSelectResult(db as ReturnType<typeof createMockDb>, [
  { id: 1, name: 'My Project' }
]);

// Control what an insert().values().returning() resolves to
mockInsertReturning(db as ReturnType<typeof createMockDb>, [
  { id: 42, name: 'New Project' }
]);

// Control findFirst (query relational API)
(db.query.testCase.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTestCase);
```

The mock `db.transaction` automatically runs the callback with a nested transaction object that has the same chainable methods.

### Using mock-event

`src/lib/server/test-helpers/mock-event.ts` creates a mock `RequestEvent` for testing `+server.ts` route handlers directly, without spinning up an HTTP server.

```typescript
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const event = createMockEvent({
  method: 'POST',
  params: { projectId: '1' },
  body: { name: 'Test Project' },
  user: testUser,              // authenticated
  searchParams: { page: '2' }
});

const response = await POST(event);
const json = await response.json();
expect(response.status).toBe(201);
expect(json.data.name).toBe('Test Project');
```

For form data uploads:
```typescript
const formData = new FormData();
formData.append('file', new File(['content'], 'test.csv', { type: 'text/csv' }));

const event = createMockEvent({
  method: 'POST',
  formData,
  user: testUser
});
```

For unauthenticated requests, omit `user` or pass `user: null`.

### Using Fixtures

`src/lib/server/test-helpers/fixtures.ts` exports pre-built test data objects that match the database schema shapes.

```typescript
import {
  testUser,          // regular authenticated user (role: 'user')
  adminUser,         // global admin user (role: 'admin')
  sampleProject,
  sampleTestCase,
  sampleTestCaseVersion,
  sampleTestRun,
  sampleExecution
} from '$lib/server/test-helpers/fixtures';
```

Use these as starting points and spread-override for variations:
```typescript
const deletedProject = { ...sampleProject, active: false };
const criticalTestCase = { ...sampleTestCase, id: 99 };
```

### API Route Test Pattern

The standard pattern for testing a `+server.ts` handler:

```typescript
// src/routes/api/projects/[projectId]/test-cases/bulk/bulk.api.spec.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db', () => ({ db: createMockDb() }));
vi.mock('$lib/server/auth-utils', () => ({
  requireAuth: vi.fn().mockReturnValue(testUser),
  requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
  parseJsonBody: vi.fn()
}));

import { db } from '$lib/server/db';
import { parseJsonBody } from '$lib/server/auth-utils';
import { POST } from './+server';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestCase } from '$lib/server/test-helpers/fixtures';

describe('POST /api/projects/:projectId/test-cases/bulk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when testCaseIds is empty', async () => {
    (parseJsonBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      action: 'delete',
      testCaseIds: []
    });

    const event = createMockEvent({ method: 'POST', params: { projectId: '1' } });
    const response = await POST(event);
    expect(response.status).toBe(400);
  });
});
```

---

## How to Add a New API Route

1. **Create the directory** following the SvelteKit file-based routing convention:
   ```
   src/routes/api/<your-path>/+server.ts
   ```

2. **Export the appropriate HTTP method handlers.** Prefer the `withProjectAccess`/`withProjectRole` wrappers from `$lib/server/api-handler` — they handle auth, project ID parsing, and role checks automatically:

   ```typescript
   import { json } from '@sveltejs/kit';
   import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
   import { db } from '$lib/server/db';

   // Read-only — any project member can access
   export const GET = withProjectAccess(async ({ projectId, url }) => {
     const items = await db.query.myTable.findMany({ ... });
     return json(items);
   });

   // Write — restricted to specific roles
   export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ projectId, request, user }) => {
     const body = await request.json();
     // ... validate and insert ...
     return json(created, { status: 201 });
   });
   ```

   For non-project-scoped routes, use `requireAuth` directly:
   ```typescript
   import { json } from '@sveltejs/kit';
   import type { RequestHandler } from './$types';
   import { requireAuth } from '$lib/server/auth-utils';

   export const GET: RequestHandler = async ({ locals }) => {
     const user = requireAuth(locals);
     // ...
     return json(result);
   };
   ```

3. **Validation:** Add or reuse a Zod schema from `src/lib/schemas/`. Schemas that are used both server-side and client-side live in `src/lib/schemas/`. Schemas used only by a single route can be defined inline in the route file.

4. **Auth:** Always call `requireAuth` first. For project-scoped routes, follow with `requireProjectAccess` (read-only access check) or `requireProjectRole` (write-access check). The global admin role bypasses all project role checks automatically.

5. **Error handling:** Use helpers from `$lib/server/errors`:
   - `badRequest('message')` — returns `400` JSON response
   - `notFound('message')` — returns `404` JSON response
   - `conflict('message')` — returns `409` JSON response

   Or throw `error(statusCode, 'message')` from `@sveltejs/kit` for other HTTP errors.

6. **Write a test file** next to the route: `+server.spec.ts` or `<name>.api.spec.ts`. Use the test helpers described in the [Testing Guide](#testing-guide).

7. **Document the endpoint** in `docs/API.md`.

---

## How to Add a New Page

SvelteKit pages use file-based routing under `src/routes/`.

1. **Create the route directory and files:**
   ```
   src/routes/projects/[projectId]/my-feature/
   ├── +page.server.ts   # Server-side load function and form actions
   └── +page.svelte      # Page component
   ```

2. **Load function** in `+page.server.ts`:
   ```typescript
   import type { PageServerLoad } from './$types';
   import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

   export const load: PageServerLoad = async ({ locals, params, parent }) => {
     // Access parent layout data (e.g. userRole from [projectId]/+layout.server.ts)
     const { userRole } = await parent();

     const user = requireAuth(locals);
     const projectId = Number(params.projectId);

     const data = await db.query.myTable.findMany({ ... });

     return { data };
   };
   ```

3. **Page component** in `+page.svelte`:
   ```svelte
   <script lang="ts">
     import type { PageData } from './$types';

     let { data }: { data: PageData } = $props();
   </script>

   <h1>My Feature</h1>
   {#each data.items as item}
     <p>{item.name}</p>
   {/each}
   ```

4. **Navigation:** Add a link to the page from the appropriate sidebar or navigation component in `src/lib/components/`.

5. **i18n:** Use paraglide message keys for all user-visible text. See [How to add i18n messages](#how-to-add-i18n-messages).

6. **Access control:** The project layout (`src/routes/projects/[projectId]/+layout.server.ts`) loads the user's `userRole`. Use this to guard UI elements or redirect viewers away from write-only pages:
   ```typescript
   import { redirect } from '@sveltejs/kit';
   // In load function:
   if (userRole === 'VIEWER') redirect(303, '../');
   ```

---

## How to Add i18n Messages

This project uses `@inlang/paraglide-js` for internationalisation. Supported locales are `en` (English, default) and `ko` (Korean).

**Message files** are located at (check `project.inlang/` for the exact paths). Typically:
```
messages/
├── en.json
└── ko.json
```

**Steps:**

1. Add the message key and English text to `messages/en.json`:
   ```json
   {
     "testCase.priority.critical": "Critical",
     "myFeature.title": "My Feature Title"
   }
   ```

2. Add the Korean translation to `messages/ko.json`:
   ```json
   {
     "testCase.priority.critical": "위험",
     "myFeature.title": "내 기능 제목"
   }
   ```

3. Run the paraglide compiler (happens automatically on `pnpm dev` or `pnpm build`).

4. Import and use the generated message function in your component:
   ```svelte
   <script lang="ts">
     import * as m from '$lib/paraglide/messages.js';
   </script>

   <h1>{m.myFeature_title()}</h1>
   ```

**Naming conventions:**
- Use dot notation in the JSON key: `"domain.subDomain.key"`
- The generated function uses camelCase with underscores for dots: `m.domain_subDomain_key()`
- Keep keys descriptive and scoped to the feature

**Parameterised messages:**
```json
{ "items.count": "Showing {count} items" }
```
```svelte
{m.items_count({ count: data.total })}
```

---

## Database Changes with Drizzle ORM

### Modifying the schema

1. Edit `src/lib/server/db/schema.ts` to add tables, columns, or relations.
2. During development, run `pnpm db:push` to apply changes directly (no migration file needed).
3. For production-ready changes, generate a migration file:
   ```bash
   pnpm db:generate    # creates a file in drizzle/
   pnpm db:migrate     # applies pending migrations
   ```

### Drizzle conventions used in this codebase

- Always use `.returning()` after `insert()` or `update()` when you need the created/updated row
- Prefer the relational query API (`db.query.table.findFirst({ with: { relation: true } })`) for reads with relations
- Use `db.transaction(async (tx) => { ... })` for multi-step writes that must be atomic
- Zod schema validation always happens before any DB operation

---

## Git Commit Conventions

This project follows a simplified version of the Conventional Commits specification.

```
<type>: <short summary in imperative mood>

[optional body]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | New feature visible to users or API consumers |
| `fix` | Bug fix |
| `refactor` | Internal restructuring with no behaviour change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build system, dependency updates, tooling |
| `perf` | Performance improvement |

**Examples:**
```
feat: add bulk clone action to test cases
fix: prevent duplicate tag assignment in bulk operations
refactor: extract lock logic from test case route into server helper
test: add coverage for optimistic concurrency in PUT /test-cases/:id
docs: document automation webhook endpoint
chore: upgrade drizzle-orm to 0.45
```

**Rules:**
- Summary is imperative mood, lowercase, no trailing period
- Keep the summary under 72 characters
- Reference issue numbers in the body if applicable: `Closes #42`
- Do not amend commits that have already been pushed to a shared branch

---

## Pull Request Process

1. **Branch from `main`** with a descriptive branch name:
   ```bash
   git checkout -b feat/bulk-tag-operations
   git checkout -b fix/lock-refresh-race-condition
   ```

2. **Keep PRs focused.** One logical change per PR. Break large features into incremental PRs.

3. **Before submitting:**
   - `pnpm check` — no TypeScript errors
   - `pnpm test` — all tests pass
   - `pnpm format:check` — no formatting issues (or run `pnpm format` to fix)
   - `pnpm lint` — no lint errors

4. **PR description must include:**
   - What the change does and why
   - How to test it manually (if applicable)
   - Any database migrations required

5. **Merge strategy:** Squash merge into `main`. The PR title becomes the squash commit message, so it must follow the commit convention above.

6. **Review requirements:**
   - At least one approval from a maintainer
   - All CI checks must pass (type check, tests, lint)
   - Resolve all review comments before merging

7. **After merge:** Delete the feature branch.
