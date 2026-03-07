# TestMini -- QA Management System

An internal QA management system. Supports per-project test case management, test execution, failure tracking, and real-time synchronization.

## Key Features

- **Project Management** -- Create/edit/deactivate projects, invite members and manage roles
- **Test Cases** -- Version control, group/tag classification, drag-and-drop sorting, bulk actions, Import/Export (CSV/JSON)
- **Test Runs** -- Per-environment execution, inline status changes, Bulk Pass, progress indicators
- **Failure Details** -- Record failure environment, error messages, and stack traces
- **File Attachments** -- Upload files to test cases/executions/failures (MIME whitelist, access control, drag and drop)
- **Real-time Sync** -- SSE + Redis Pub/Sub based live test run updates
- **Dashboard/Reports** -- Pass rate, per-environment/priority statistics, Chart.js charts (lazy-loaded), date range filters, CSV streaming export, widget customization
- **OIDC Integration** -- Admins can add external IdPs (Keycloak, Google, etc.) at runtime, JWKS signature verification, approval queue for new users
- **User Approval Queue** -- When OIDC autoRegister is off, new users enter a pending state; admins approve/reject from the Admin panel
- **Security** -- Rate Limiting (Redis), security headers, PBKDF2 key derivation, SSRF protection, path traversal prevention
- **Audit Logs** -- Record key operation history, Admin view page (filters, pagination)
- **Notification System** -- In-app notification bell, 30-second polling, mark as read
- **TC Templates** -- Save/apply reusable TC structures as templates
- **TC Comments** -- Per-TC comment threads (single-level replies, edit/delete)
- **Keyboard Shortcuts** -- Mod+S save, Mod+K search, ? hint panel
- **Data Loss Prevention** -- Form navigation warnings (beforeNavigate/beforeunload), inline edit auto-commit, API key copy confirmation
- **Internationalization** -- Korean/English (Paraglide)
- **Dark Mode** -- System preference detection + manual toggle

---

## Tech Stack

| Area | Technology |
|------|------------|
| Frontend + Backend | **SvelteKit** (SSR + API), **Svelte 5** (runes), **TypeScript** |
| UI | **shadcn-svelte** (Radix UI), **TailwindCSS v4** |
| Form Handling | **sveltekit-superforms** + **zod** |
| DB / ORM | **PostgreSQL**, **Drizzle ORM** (postgres.js) |
| Auth | **better-auth** (email/password login + admin plugin, self-registration disabled) |
| OIDC | Custom OAuth/PKCE handler (runtime IdP management) |
| Cache / Real-time | **Redis** (ioredis) -- Soft Lock, SSE Pub/Sub |
| File Storage | Local file system (S3-ready) |
| Charts | **Chart.js** |
| i18n | **Paraglide** (ko, en) |
| Logging | **pino** (structured logging, request ID tracing) |
| Testing | **Vitest** (523 unit/component tests), **Playwright** (5 E2E suites) |
| Package Manager | **pnpm** |

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm
- Docker & Docker Compose

> For a detailed deployment guide, see [docs/DEPLOY.md](./docs/DEPLOY.md).

### Installation

```bash
# Install dependencies
pnpm install

# Start Docker services (PostgreSQL, Redis)
docker compose up -d

# Set up environment variables
cp .env.example .env
# Configure ORIGIN and BETTER_AUTH_SECRET in the .env file

# Run DB migration
pnpm db:push

# Start the development server
pnpm dev
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://root:mysecretpassword@localhost:5432/local` |
| `ORIGIN` | Application base URL | `http://localhost:5173` |
| `BETTER_AUTH_SECRET` | Auth secret (32+ characters recommended) | Random string |

### Scripts

```bash
pnpm dev              # Development server
pnpm build            # Production build
pnpm preview          # Preview build
pnpm check            # Type check
pnpm test             # Run tests
pnpm lint             # Run ESLint
pnpm format           # Prettier formatting
pnpm format:check     # Check formatting
pnpm db:push          # Push DB schema
pnpm db:generate      # Generate migrations
pnpm db:migrate       # Run migrations
pnpm db:studio        # Drizzle Studio (DB GUI)
pnpm auth:schema      # Generate better-auth schema
```

---

## Authentication / Authorization

### Auth Methods

- **Email/Password** -- better-auth login (self-registration disabled; accounts are created via OIDC or admin seeding)
- **OIDC/OAuth2** -- Admins can register/manage external IdPs at runtime via the Admin panel
- **Approval Queue** -- When OIDC `autoRegister` is off, new users are created in a pending state and redirected to `/auth/pending`; admins approve or reject from `/admin/users`
  - PKCE (S256) support
  - OIDC Discovery auto-configuration (SSRF protection: private IP blocking, HTTPS enforced)
  - JWKS-based ID token signature verification (RS256/384/512)
  - Client secret encrypted with AES-256-GCM (PBKDF2 key derivation)
  - Email-based automatic account matching
  - Account linking/unlinking management

### Global Role

| Role | Description |
|------|-------------|
| **ADMIN** | Full system management (Admin panel access, access to all projects) |
| **USER** | Default role, access limited to assigned projects |

### Project Role

| Feature | PROJECT_ADMIN | QA | DEV | VIEWER |
|---------|:---:|:---:|:---:|:---:|
| View project / dashboard / reports | O | O | O | O |
| Data Export (CSV) | O | O | O | O |
| SSE real-time event subscription | O | O | O | O |
| Create/edit test cases | O | O | O | |
| Clone / reorder / lock test cases | O | O | O | |
| Create / clone test runs | O | O | O | |
| Change execution status (PASS/FAIL, etc.) | O | O | O | |
| Record failure details | O | O | O | |
| Create/edit groups | O | O | O | |
| Manage tags | O | O | O | |
| Import test cases | O | O | | |
| Create/edit Test Suites | O | O | | |
| Delete test cases | O | | | |
| Delete test runs | O | | | |
| Delete groups | O | | | |
| Bulk delete | O | | | |
| Edit project settings | O | | | |
| Manage members (add/change role/remove) | O | | | |

> Global ADMIN has PROJECT_ADMIN permissions across all projects.

---

## Admin Panel

URL: `/admin` (Global ADMIN only)

| Tab | Path | Features |
|-----|------|----------|
| Users | `/admin/users` | User list, role changes, ban/unban, approve/reject pending users |
| Projects | `/admin/projects` | Manage all projects |
| OIDC Providers | `/admin/oidc-providers` | Register/edit/delete/toggle IdPs |
| Audit Logs | `/admin/audit-logs` | View audit logs (user, action, date filters) |

---

## Architecture

```
Browser
  |
  +-- SvelteKit (SSR + API)
  |     +-- better-auth (auth/session)
  |     +-- Drizzle ORM (queries)
  |     +-- SSE (real-time)
  |     +-- Paraglide (i18n)
  |
  +-- PostgreSQL (data)
  +-- Redis (Lock, Pub/Sub)
  +-- Local Storage (file attachments)
```

### Docker Compose Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| db | postgres | 5432 | Main database |
| redis | redis:7-alpine | 6379 | Soft Lock, SSE Pub/Sub |

---

## Concurrency Management

### Soft Lock (Redis)

- Redis-based locking when editing test cases
- TTL: 10 minutes, auto-expiry
- UI displays the currently editing user

### Optimistic Lock

- Checks the `revision` field on save
- Notifies the user when a conflict is detected

---

## Directory Structure

```
src/
+-- routes/
|   +-- auth/              # Auth (login, OIDC, account linking, pending approval)
|   +-- admin/             # Global Admin (users, projects, OIDC management)
|   +-- projects/          # Projects (dashboard, TC, runs, settings, reports)
|   +-- account/           # User profile/account settings
|   +-- api/               # REST API endpoints
+-- lib/
|   +-- components/        # Svelte components
|   |   +-- ui/            # shadcn-svelte components
|   +-- schemas/           # zod validation schemas
|   +-- server/            # Server-only (auth, db, redis, lock, crypto, storage, audit, notifications)
|   +-- paraglide/         # i18n generated files
|   +-- auth-client.ts     # better-auth client
+-- app.d.ts
+-- hooks.server.ts        # SvelteKit hooks (auth, i18n, security headers, rate limiting)
```

---

## Implementation Status

- [x] **Phase 1** -- Auth, project CRUD, member management, test cases/runs/executions, failure details, file attachments, i18n
- [x] **Phase 2** -- Redis integration, SSE real-time sync, dashboard/reports, Admin panel
- [x] **Phase 3** -- Dynamic OIDC/OAuth management, full-text search, virtual scrolling, Import/Export
- [x] **Phase 4** -- CI integration (`automation_key`, project API keys, automation result API, CI webhook)

For the detailed implementation plan, see [docs/PLAN.md](./docs/PLAN.md). For planned features, see [docs/TODO.md](./docs/TODO.md).
