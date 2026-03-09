# TestMini -- Deployment Guide

> Last updated: 2026-03-08

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables](#2-environment-variables)
3. [Development Environment Setup](#3-development-environment-setup)
4. [Production Deployment](#4-production-deployment)
   - [Docker Compose (Recommended)](#41-docker-compose-recommended)
   - [Manual Deployment](#42-manual-deployment)
5. [Database](#5-database)
6. [Backup and Restore](#6-backup-and-restore)
   - [Manual Backup](#61-manual-backup)
   - [Restore from Backup](#62-restore-from-backup)
   - [Automated Backup (Docker Compose)](#63-automated-backup-docker-compose)
   - [Backup Integrity Verification](#64-backup-integrity-verification)
7. [SSL / Reverse Proxy](#7-ssl--reverse-proxy)
8. [Monitoring](#8-monitoring)
9. [Troubleshooting](#9-troubleshooting)
10. [Rollback](#10-rollback)

---

## 1. Prerequisites

### Common

| Software | Minimum Version | Notes |
|-----------|-----------|------|
| Node.js | 24+ | LTS recommended |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| PostgreSQL | 16+ | Production compose uses 17-alpine |
| Redis | 7+ | Optional: SSE real-time sync and Soft Lock (in-memory fallback available) |
| S3/MinIO | — | Optional: Object storage for file uploads (local filesystem fallback available) |

### Additional Requirements for Docker Deployment

| Software | Minimum Version |
|-----------|-----------|
| Docker | 24+ |
| Docker Compose | v2.20+ |

### Server Specifications (Minimum Recommended)

- CPU: 1 vCPU
- Memory: 1 GB RAM
- Disk: 10 GB (allocate enough considering file attachment volumes)

---

## 2. Environment Variables

Copy `.env.example` to create `.env` and configure the following items.

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Example |
|------|------|------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:password@localhost:5432/testmini` |
| `ORIGIN` | Public URL of the app (without trailing slash) | `https://qa.example.com` |
| `BETTER_AUTH_SECRET` | Session signing secret (minimum 32 characters) | Output of `openssl rand -base64 32` |

### Optional Variables

| Variable | Description | Default | Example |
|------|------|--------|------|
| `REDIS_URL` | Redis connection string (omit to use in-memory fallback) | — | `redis://:password@localhost:6379` |
| `S3_BUCKET` | S3/MinIO bucket name (omit to use local filesystem) | — | `testmini` |
| `S3_ENDPOINT` | S3/MinIO endpoint URL | — | `http://localhost:9000` |
| `S3_REGION` | S3 region | `us-east-1` | `us-east-1` |
| `S3_ACCESS_KEY_ID` | S3/MinIO access key | — | `minioadmin` |
| `S3_SECRET_ACCESS_KEY` | S3/MinIO secret key | — | `minioadmin` |
| `PORT` | App listening port | `3000` | `3000` |
| `NODE_ENV` | Node execution environment | — | `production` |
| `SMTP_HOST` | SMTP server hostname (omit to disable email) | — | `smtp.example.com` |
| `SMTP_PORT` | SMTP server port | `587` | `587` |
| `SMTP_USER` | SMTP authentication username | — | `noreply@example.com` |
| `SMTP_PASS` | SMTP authentication password | — | `password` |
| `SMTP_FROM` | Email sender address | `SMTP_USER` value | `noreply@example.com` |

### Docker Compose Only Variables (`compose.prod.yaml`)

`compose.prod.yaml` reads the following variables from the host environment (`.env` file or shell).

| Variable | Description | Example |
|------|------|------|
| `POSTGRES_PASSWORD` | PostgreSQL `testmini` account password | Output of `openssl rand -base64 24` |
| `REDIS_PASSWORD` | Redis `requirepass` password | Output of `openssl rand -base64 24` |
| `ORIGIN` | Public URL of the app | `https://qa.example.com` |
| `BETTER_AUTH_SECRET` | Session signing secret | Output of `openssl rand -base64 32` |
| `APP_PORT` | Port exposed to the host | `3000` |
| `S3_BUCKET` | S3/MinIO bucket name (optional) | `testmini` |
| `S3_ENDPOINT` | S3/MinIO endpoint URL (optional) | `http://minio:9000` |
| `S3_REGION` | S3 region (optional) | `us-east-1` |
| `S3_ACCESS_KEY_ID` | S3/MinIO access key (optional) | `minioadmin` |
| `S3_SECRET_ACCESS_KEY` | S3/MinIO secret key (optional) | `minioadmin` |

> **Warning:** If `BETTER_AUTH_SECRET` is leaked, session token forgery becomes possible. Never commit it to Git.

### Generating Strong Secrets

```bash
# BETTER_AUTH_SECRET
openssl rand -base64 32

# POSTGRES_PASSWORD, REDIS_PASSWORD
openssl rand -base64 24
```

---

## 3. Development Environment Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd testmini

# 2. Install dependencies
pnpm install

# 3. Start development Docker services (PostgreSQL + Redis + MinIO)
docker compose -f compose.yaml up -d

# 4. Configure environment variables
cp .env.example .env
# Open .env file and set DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET

# 5. Apply DB schema
pnpm db:push

# 6. Start the development server
pnpm dev
```

The development server runs at `http://localhost:5173` by default.

### Development Environment Variable Example (`.env`)

```dotenv
DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/local"
ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="dev-only-secret-change-in-production"
REDIS_URL="redis://localhost:6379"
# Optional: S3/MinIO (omit to use local filesystem at data/uploads/)
# S3_BUCKET="testmini"
# S3_ENDPOINT="http://localhost:9000"
# S3_ACCESS_KEY_ID="minioadmin"
# S3_SECRET_ACCESS_KEY="minioadmin"
```

### Key Development Scripts

```bash
pnpm dev              # Development server (HMR)
pnpm check            # TypeScript + Svelte type checking
pnpm test             # Vitest unit tests
pnpm test:e2e         # Playwright E2E tests
pnpm lint             # ESLint check
pnpm format           # Prettier format
pnpm db:studio        # Drizzle Studio (browser DB GUI)
```

---

## 4. Production Deployment

### 4.1 Docker Compose (Recommended)

Uses `compose.prod.yaml`. The app (Node 24-alpine), PostgreSQL 17, and Redis 7 are included in a single configuration.

#### Docker Image Optimization

The Dockerfile uses a 3-stage build for minimal image size and fast rebuilds:

1. **deps** — Installs dependencies with pnpm store cache mount (`--mount=type=cache`)
2. **build** — Builds the app and creates a production-only node_modules via `pnpm deploy --prod`
3. **runtime** — Copies only the build output, prod deps, and drizzle migrations

Health checks use Node.js `fetch()` instead of wget/curl, eliminating an extra package dependency.

#### Architecture

```
Internet
  |
  +-- Reverse Proxy (Nginx / Caddy)  <-- HTTPS termination
        |
        +-- app:3000  (frontend network)
              |
              +-- db:5432    (backend network, not exposed externally)
              +-- redis:6379 (backend network, not exposed externally)
              +-- minio:9000 (optional, backend network)
```

#### Deployment Procedure

```bash
# 1. Clone the repository on the server
git clone <repository-url>
cd testmini

# 2. Create the production environment variable file
cat > .env << 'EOF'
POSTGRES_PASSWORD=<strong_password>
REDIS_PASSWORD=<strong_password>
ORIGIN=https://qa.example.com
BETTER_AUTH_SECRET=<random_string_32_chars_or_more>
APP_PORT=3000
EOF

# 3. Build Docker images and start services
docker compose -f compose.prod.yaml up -d --build

# 4. Run DB migration
docker compose -f compose.prod.yaml exec app pnpm db:migrate

# 5. Check service status
docker compose -f compose.prod.yaml ps
```

#### Checking Service Status

```bash
# Overall service status
docker compose -f compose.prod.yaml ps

# App health check (returns {"status":"ok"} when healthy)
curl http://localhost:3000/api/health

# View logs
docker compose -f compose.prod.yaml logs -f app
docker compose -f compose.prod.yaml logs -f db
docker compose -f compose.prod.yaml logs -f redis
```

#### Restarting Services

```bash
# Rebuild and restart app only
docker compose -f compose.prod.yaml up -d --build app

# Restart all services
docker compose -f compose.prod.yaml restart
```

#### Stopping Services

```bash
# Stop containers only (preserve volumes)
docker compose -f compose.prod.yaml down

# Delete volumes as well (data reset -- use with caution!)
docker compose -f compose.prod.yaml down -v
```

---

### 4.2 Manual Deployment

This method deploys directly to a Node.js server without using Docker.

#### Prerequisites

- PostgreSQL 16+ database and user created
- Redis 7+ server (optional; omit REDIS_URL to use in-memory fallback)
- Node.js 24+ and pnpm installed

#### Build and Deploy

```bash
# 1. Clone the repository
git clone <repository-url>
cd testmini

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Configure environment variables
cp .env.example .env
# Edit .env file: set DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET
# Optionally set REDIS_URL (omit for in-memory fallback)

# 4. Production build
pnpm build

# 5. Keep only production dependencies (optional, when transferring from build server to deployment server)
pnpm prune --prod

# 6. Run DB migration
pnpm db:migrate

# 7. Start the server
NODE_ENV=production node build
```

#### Process Management (PM2 Recommended)

```bash
# Install PM2 globally
pnpm add -g pm2

# Start the app
NODE_ENV=production pm2 start build/index.js --name testmini

# Register auto-start on server reboot
pm2 startup
pm2 save

# Check status
pm2 status
pm2 logs testmini
```

#### systemd Unit File Example

```ini
# /etc/systemd/system/testmini.service
[Unit]
Description=TestMini QA Management System
After=network.target postgresql.service

[Service]
Type=simple
User=testmini
WorkingDirectory=/opt/testmini
EnvironmentFile=/opt/testmini/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/testmini/build/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# Register and start the unit
sudo systemctl daemon-reload
sudo systemctl enable testmini
sudo systemctl start testmini
sudo systemctl status testmini
```

---

## 5. Database

### Migration Commands

```bash
# Generate migration files (after schema changes)
pnpm db:generate

# Run migrations (apply SQL files)
pnpm db:migrate

# Apply schema immediately (development only, without migration files)
pnpm db:push
```

> **Always use `db:migrate` in production.** `db:push` is for development environments only.

### Migration in Docker Environment

```bash
# Run inside the app container
docker compose -f compose.prod.yaml exec app pnpm db:migrate
```

### Migration File Location

```
drizzle/
├── 0000_puzzling_klaw.sql                  # Initial schema
├── 0001_aromatic_black_queen.sql           # OIDC provider/account tables
├── 0002_search_indexes.sql
├── 0002_overconfident_plazm.sql
├── 0004_index_tuning.sql
├── 0006_test_execution_constraints.sql
├── 0007_attachment_referential_integrity.sql
├── 0008_audit_log.sql
├── 0009_test_case_templates.sql
├── 0010_test_case_comments.sql
├── 0011_notifications.sql
├── 0012_dashboard_layout.sql
├── 0013_automation_key.sql
├── 0014_project_api_key.sql
├── 0015_add_updated_at.sql
├── 0016_app_config.sql
├── 0017_user_approval.sql                  # Add approved column to user table
├── 0018_custom_priorities.sql
├── 0019_project_webhooks.sql
├── 0020_notification_preferences.sql
├── 0021_custom_fields.sql
├── 0022_execution_comments.sql
├── 0023_issue_tracker.sql
├── 0024_traceability_matrix.sql
├── 0025_saved_filters.sql
├── 0026_issue_link_status_sync.sql
├── 0027_shared_reports.sql
├── 0028_parameterized_tests.sql
├── 0029_approval_workflow.sql
├── 0030_gherkin_support.sql
├── 0031_exploratory_sessions.sql
├── 0032_environment_config.sql
├── 0033_test_plans.sql
└── 0034_team_hierarchy.sql
```

---

## 6. Backup and Restore

Backup scripts are located in the `scripts/backup/` directory. Both Docker exec mode (running alongside the Compose stack) and direct connection mode are supported.

### 6.1 Manual Backup

#### Using the Script (Recommended)

```bash
# Backup in Docker Compose environment (default: ./backups directory, retain 30)
./scripts/backup/pg-backup.sh

# Specify backup directory and retention count
./scripts/backup/pg-backup.sh --backup-dir /opt/backups --retain 14

# Direct connection mode (without Docker)
./scripts/backup/pg-backup.sh \
  --mode direct \
  --host localhost \
  --port 5432 \
  --user testmini \
  --password "$POSTGRES_PASSWORD" \
  --dbname testmini

# Can also be configured via environment variables
POSTGRES_PASSWORD=secret BACKUP_DIR=/opt/backups ./scripts/backup/pg-backup.sh
```

#### One-liner (Docker Compose Environment)

```bash
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  pg_dump -U testmini testmini \
  | gzip > backup_$(date +%Y-%m-%d_%H%M%S).sql.gz
```

#### One-liner (Direct Connection)

```bash
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h localhost -p 5432 -U testmini testmini \
  | gzip > backup_$(date +%Y-%m-%d_%H%M%S).sql.gz
```

#### Full List of Script Options

| Option | Description | Default |
|------|------|--------|
| `-d`, `--backup-dir` | Backup storage directory | `./backups` |
| `-r`, `--retain` | Maximum number of backups to retain | `30` |
| `-m`, `--mode` | `docker` or `direct` | `docker` |
| `-c`, `--compose-file` | Compose file path | `compose.prod.yaml` |
| `-s`, `--service` | DB service name | `db` |
| `-h`, `--host` | DB host (direct mode) | `localhost` |
| `-p`, `--port` | DB port (direct mode) | `5432` |
| `-U`, `--user` | DB user | `testmini` |
| `-P`, `--password` | DB password | `$POSTGRES_PASSWORD` |
| `-n`, `--dbname` | DB name | `testmini` |

### 6.2 Restore from Backup

#### Using the Script (Recommended)

```bash
# Shows confirmation prompt before restoring (default)
./scripts/backup/pg-restore.sh ./backups/backup_2026-03-05_020000.sql.gz

# Skip confirmation (for use in automation scripts)
./scripts/backup/pg-restore.sh --force ./backups/backup_2026-03-05_020000.sql.gz

# Direct connection mode
./scripts/backup/pg-restore.sh \
  --mode direct \
  --host localhost \
  --user testmini \
  --password "$POSTGRES_PASSWORD" \
  --dbname testmini \
  ./backups/backup_2026-03-05_020000.sql.gz
```

The restore script operates in the following order:

1. Display summary and confirmation prompt (can be skipped with `--force`)
2. Terminate active connections to the existing DB (`pg_terminate_backend`)
3. DROP and recreate the database
4. Decompress gzip and restore SQL (`ON_ERROR_STOP=1`)
5. Verify table count based on `information_schema.tables`

#### One-liner (Docker Compose Environment)

```bash
# Warning: All existing data will be deleted
gunzip -c backup_2026-03-05_020000.sql.gz | \
  docker compose -f compose.prod.yaml exec -T db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini testmini
```

### 6.3 Automated Backup (Docker Compose)

The `backup` service in `compose.prod.yaml` handles automated backups. It runs an initial backup once when the stack starts, then repeats according to the cron schedule.

#### Backup Service Environment Variables

| Variable | Description | Default |
|------|------|--------|
| `BACKUP_SCHEDULE` | Cron expression | `0 2 * * *` (daily at 02:00) |
| `BACKUP_RETAIN` | Maximum number of backups to retain | `30` |

Configure in the `.env` file or shell.

```dotenv
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETAIN=30
```

#### Backup File Location

Backups are stored in the `backups` Docker volume (`/backups`). To access from the host:

```bash
# Check volume mount location
docker volume inspect testmini_backups

# List backups
docker compose -f compose.prod.yaml exec backup ls -lh /backups/

# Copy backup file to host
docker compose -f compose.prod.yaml \
  cp backup:/backups/backup_2026-03-05_020000.sql.gz ./
```

#### Checking Backup Service Logs

```bash
docker compose -f compose.prod.yaml logs -f backup
```

#### Trigger an Immediate Backup Manually

```bash
docker compose -f compose.prod.yaml exec backup \
  /usr/local/bin/run-backup.sh
```

#### Cron Schedule Examples

| Expression | Description |
|--------|------|
| `0 2 * * *` | Daily at 02:00 (default) |
| `0 */6 * * *` | Every 6 hours |
| `0 2 * * 0` | Every Sunday at 02:00 |
| `30 1 1 * *` | 1st of every month at 01:30 |

### 6.4 Backup Integrity Verification

#### gzip File Validity Check

```bash
# Check gzip integrity (detect corrupted files)
gzip -t backup_2026-03-05_020000.sql.gz && echo "OK" || echo "CORRUPTED"

# Preview file contents (first 20 lines)
gunzip -c backup_2026-03-05_020000.sql.gz | head -20
```

#### Verify Restore on a Test DB

```bash
# 1. Create a temporary DB for verification
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini -c "CREATE DATABASE testmini_verify;"

# 2. Restore backup
gunzip -c backup_2026-03-05_020000.sql.gz | \
  docker compose -f compose.prod.yaml exec -T db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini testmini_verify

# 3. Verify table count
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini testmini_verify \
  -c "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"

# 4. Drop the temporary DB
docker compose -f compose.prod.yaml exec db \
  env PGPASSWORD="$POSTGRES_PASSWORD" \
  psql -U testmini -c "DROP DATABASE testmini_verify;"
```

#### Check Backup File List and Size

```bash
# List backups in Docker volume (newest first)
docker compose -f compose.prod.yaml exec backup \
  ls -lht /backups/backup_*.sql.gz

# Total backup volume usage
docker system df -v | grep backups
```

---

## 7. SSL / Reverse Proxy

The app runs on HTTP at port 3000. You must expose it externally via HTTPS through a reverse proxy.

### Nginx Example

```nginx
# /etc/nginx/sites-available/testmini
server {
    listen 80;
    server_name qa.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name qa.example.com;

    ssl_certificate     /etc/letsencrypt/live/qa.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qa.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # File upload size limit
    client_max_body_size 50M;

    # SSE (Server-Sent Events) real-time streaming
    proxy_buffering off;
    proxy_cache off;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Prevent SSE timeout
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

```bash
# Enable Nginx configuration
sudo ln -s /etc/nginx/sites-available/testmini /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Issue Let's Encrypt certificate (certbot)
sudo certbot --nginx -d qa.example.com
```

### Caddy Example (Automatic HTTPS)

```caddyfile
# /etc/caddy/Caddyfile
qa.example.com {
    # File upload size
    request_body {
        max_size 50MB
    }

    reverse_proxy localhost:3000 {
        # Flush interval for SSE streaming
        flush_interval -1
    }
}
```

```bash
# Start Caddy (automatically issues HTTPS certificate)
sudo systemctl enable caddy
sudo systemctl start caddy
```

> The `ORIGIN` environment variable must exactly match the external URL of the reverse proxy.
> Example: `ORIGIN=https://qa.example.com`

---

## 8. Monitoring

### Health Check Endpoint

```
GET /api/health
```

- Healthy: HTTP 200, `{"status": "ok"}`
- DB connection failure: HTTP 503, `{"status": "error", "message": "Database connection failed"}`

```bash
# Manual check
curl -s http://localhost:3000/api/health | python3 -m json.tool

# Periodic monitoring (cron)
*/5 * * * * curl -sf http://localhost:3000/api/health || \
  echo "TestMini health check failed" | mail -s "Alert" admin@example.com
```

`compose.prod.yaml` automatically runs health checks every 30 seconds. After 3 consecutive failures, the container transitions to `unhealthy` status.

### Log Collection

```bash
# Docker environment logs (real-time)
docker compose -f compose.prod.yaml logs -f --tail=100 app

# Logs after a specific time
docker compose -f compose.prod.yaml logs --since="2026-03-05T00:00:00" app

# PM2 environment logs
pm2 logs testmini --lines 100
```

### Log Levels

The app outputs minimal logs when `NODE_ENV=production`. Redis connection errors and DB errors are output to stderr.

### Disk Usage Monitoring

Due to the file attachment feature, disk usage of `/app/data/uploads` (Docker: `uploads` volume) may increase. When using S3/MinIO, files are stored in the object store instead.

```bash
# Check Docker volume usage (local filesystem mode)
docker system df -v | grep uploads

# Check upload directory size (manual deployment)
du -sh /opt/testmini/data/uploads

# Check MinIO bucket usage (S3 mode)
mc du local/testmini
```

---

## 9. Troubleshooting

### App Does Not Start

**Symptom:** Container exits immediately or enters `unhealthy` status

**Cause and Resolution:**

```bash
# 1. Check logs
docker compose -f compose.prod.yaml logs app

# 2. Check for missing required environment variables
#    Verify that BETTER_AUTH_SECRET, ORIGIN, DATABASE_URL are set
docker compose -f compose.prod.yaml exec app env | grep -E "DATABASE_URL|ORIGIN|BETTER_AUTH_SECRET"

# 3. Verify DB connection
docker compose -f compose.prod.yaml exec app \
  node -e "const p = require('postgres'); p('$DATABASE_URL')().then(() => console.log('ok')).catch(console.error)"
```

### DB Migration Failure

**Symptom:** Error when running `pnpm db:migrate`

**Resolution:**

```bash
# Check DATABASE_URL environment variable
echo $DATABASE_URL

# Verify PostgreSQL connectivity
psql "$DATABASE_URL" -c "SELECT version();"

# Docker environment: Check if DB is in healthy status
docker compose -f compose.prod.yaml ps db
```

### Redis Connection Failure

**Symptom:** Real-time SSE updates are not working across multiple servers. `Redis connection error` appears in logs.

**Resolution:**

```bash
# Check Redis service status
docker compose -f compose.prod.yaml ps redis

# Test Redis connectivity (Docker environment)
docker compose -f compose.prod.yaml exec redis \
  redis-cli -a "$REDIS_PASSWORD" ping
# Expected response: PONG

# Verify REDIS_URL format (when password is included)
# redis://:password@host:6379
```

> Redis is optional. Without `REDIS_URL`, all features (SSE pub/sub, soft locks, rate limiting) use in-memory fallbacks. This is suitable for single-server deployments.

### Application-Level Cache

The application uses an in-memory TTL cache (`src/lib/server/cache.ts`) to reduce database load for frequently-read, rarely-changed data. No configuration required.

| Cache Key | Data | TTL | Invalidated By |
|-----------|------|-----|----------------|
| `global:branding` | App name, logo, favicon | 5 min | Admin branding settings save |
| `project:{id}:tags` | Project tags | 5 min | Tag create/update/delete |
| `project:{id}:members` | Project members | 5 min | Member add/update/remove |
| `project:{id}:priorities` | Priority configs | 5 min | Priority create/update/delete/reorder |
| `project:{id}:environments` | Environment configs | 5 min | Environment create/update/delete/reorder |
| `project:{id}:dashboard` | Dashboard stats | 5 min | TTL expiry only |
| `user:{id}:unread_notifications` | Unread count | 1 min | Mark as read |

> **Note**: This is a per-process in-memory cache. In multi-server deployments, each instance maintains its own cache, so changes may take up to the TTL duration to propagate across instances. For single-server deployments this is not a concern.

### Content Security Policy

CSP is configured in `svelte.config.js` with nonce-based `script-src`. SvelteKit automatically generates per-request nonces for inline scripts. `style-src` allows `unsafe-inline` for dynamic Svelte style attributes.

### Performance Monitoring

Slow requests (>1s) are automatically logged at WARN level with method, path, status, and duration. In development mode, all database queries are logged for debugging. Configure log level via `LOG_LEVEL` environment variable.

### Authentication Error Due to ORIGIN Mismatch

**Symptom:** Redirect failure after login, CSRF error

**Resolution:**

- The `ORIGIN` environment variable must exactly match the URL accessed from the browser.
- There must be no trailing slash (`/`).
- For HTTPS deployments, it must be set with `https://`.

```bash
# Examples
ORIGIN=https://qa.example.com   # Correct
ORIGIN=https://qa.example.com/  # Wrong (trailing slash)
ORIGIN=http://qa.example.com    # Wrong (http set for HTTPS deployment)
```

### File Upload Failure

**Symptom:** Error when uploading attachments

**Resolution (local filesystem):**

```bash
# Docker: Verify uploads volume mount
docker compose -f compose.prod.yaml exec app ls -la /app/data/uploads

# Manual deployment: Check directory permissions
ls -la /opt/testmini/data/uploads
# The testmini user must have write permissions

# Fix permissions
chown -R testmini:testmini /opt/testmini/data/uploads
chmod 755 /opt/testmini/data/uploads

# Reverse proxy: Check client_max_body_size setting (Nginx)
grep client_max_body_size /etc/nginx/sites-available/testmini
```

**Resolution (S3/MinIO):**

```bash
# Verify S3 env vars are set
docker compose -f compose.prod.yaml exec app env | grep S3_

# Test MinIO connectivity
curl -s http://localhost:9000/minio/health/live

# Verify bucket exists (using mc CLI)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc ls local/testmini
```

### Port Conflict

**Symptom:** `address already in use :3000`

**Resolution:**

```bash
# Check which process is using the port
lsof -i :3000

# Change APP_PORT in compose.prod.yaml
APP_PORT=8080 docker compose -f compose.prod.yaml up -d
```

### Out of Memory

**Symptom:** Container restarts due to OOM

**Resolution:**

```bash
# Check container memory usage
docker stats

# Add memory limit to compose.prod.yaml (app service)
# deploy:
#   resources:
#     limits:
#       memory: 512M
```

---

## 10. Rollback

### Rollback in Docker Compose Environment

Use a previous version's image tag, or revert to a previous Git commit and rebuild.

```bash
# 1. Stop the current service (keep DB running)
docker compose -f compose.prod.yaml stop app

# 2. Revert to a previous version via Git
git log --oneline -10         # Find the commit hash to revert to
git checkout <previous_commit_hash>

# 3. Rebuild image and start
docker compose -f compose.prod.yaml up -d --build app

# 4. Verify health check
curl -s http://localhost:3000/api/health
```

### DB Migration Rollback

Drizzle ORM does not support automatic rollback. If a migration rollback is needed:

```bash
# Method 1: Restore from pre-deployment backup (using script)
./scripts/backup/pg-restore.sh --force backup_before_deploy.sql.gz

# Method 2: Manually run reverse SQL
# Refer to migration files in the drizzle/ directory
# and manually write and execute DROP/ALTER statements
docker compose -f compose.prod.yaml exec db psql -U testmini testmini
```

> Migration rollback carries a risk of data loss. **Always perform a backup before deployment.**

### Pre-Deployment Checklist

Verify the following items before deployment.

- [ ] Database backup completed
- [ ] `.env` environment variables verified (especially `ORIGIN`, `BETTER_AUTH_SECRET`)
- [ ] Confirmed whether `pnpm db:migrate` needs to be run (if new migration files exist)
- [ ] Health check endpoint (`/api/health`) returns a normal response after deployment
- [ ] Reverse proxy configuration verified (HTTPS, SSE timeout)
- [ ] Upload volume/directory mount verified (or S3/MinIO bucket accessible)
