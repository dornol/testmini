#!/usr/bin/env bash
# pg-restore.sh — PostgreSQL restore script for testmini
#
# Usage:
#   ./pg-restore.sh [OPTIONS] <backup-file>
#
# Arguments:
#   <backup-file>           Path to the .sql.gz backup file to restore
#
# Options:
#   -f, --force             Skip confirmation prompt
#   -m, --mode MODE         Connection mode: docker (default) or direct
#   -c, --compose-file FILE Path to compose file (default: compose.prod.yaml)
#   -s, --service NAME      Docker Compose db service name (default: db)
#   -h, --host HOST         DB host for direct mode (default: localhost)
#   -p, --port PORT         DB port for direct mode (default: 5432)
#   -U, --user USER         DB superuser for drop/create (default: $POSTGRES_USER or testmini)
#   -P, --password PASS     DB password (default: $POSTGRES_PASSWORD)
#   -n, --dbname NAME       DB name to restore into (default: $POSTGRES_DB or testmini)
#       --help              Show this help

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
FORCE=false
MODE="${MODE:-docker}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-${POSTGRES_USER:-testmini}}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-testmini}}"
BACKUP_FILE=""

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--force)         FORCE=true;         shift ;;
    -m|--mode)          MODE="$2";          shift 2 ;;
    -c|--compose-file)  COMPOSE_FILE="$2";  shift 2 ;;
    -s|--service)       DB_SERVICE="$2";    shift 2 ;;
    -h|--host)          DB_HOST="$2";       shift 2 ;;
    -p|--port)          DB_PORT="$2";       shift 2 ;;
    -U|--user)          DB_USER="$2";       shift 2 ;;
    -P|--password)      DB_PASSWORD="$2";   shift 2 ;;
    -n|--dbname)        DB_NAME="$2";       shift 2 ;;
    --help)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# *//'
      exit 0
      ;;
    -*)
      log_error "Unknown option: $1"
      exit 1
      ;;
    *)
      BACKUP_FILE="$1"
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [[ -z "$BACKUP_FILE" ]]; then
  log_error "No backup file specified."
  echo "Usage: $0 [OPTIONS] <backup-file>"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  log_error "Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [[ "$MODE" != "docker" && "$MODE" != "direct" ]]; then
  log_error "Invalid mode '$MODE'. Must be 'docker' or 'direct'."
  exit 1
fi

if [[ "$MODE" == "direct" && -z "$DB_PASSWORD" ]]; then
  log_error "DB_PASSWORD / POSTGRES_PASSWORD must be set for direct mode."
  exit 1
fi

if [[ "$MODE" == "docker" ]]; then
  if ! command -v docker &>/dev/null; then
    log_error "docker command not found."
    exit 1
  fi
else
  for cmd in psql pg_restore; do
    if ! command -v "$cmd" &>/dev/null; then
      log_error "$cmd command not found. Install postgresql-client."
      exit 1
    fi
  done
fi

# ---------------------------------------------------------------------------
# Resolve container (docker mode)
# ---------------------------------------------------------------------------
if [[ "$MODE" == "docker" ]]; then
  CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q "$DB_SERVICE" 2>/dev/null || true)"
  if [[ -z "$CONTAINER" ]]; then
    log_error "Could not find running container for service '$DB_SERVICE' in '$COMPOSE_FILE'."
    log_error "Make sure the stack is running: docker compose -f $COMPOSE_FILE ps"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Summary and confirmation
# ---------------------------------------------------------------------------
BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"

echo ""
echo "  *** RESTORE SUMMARY ***"
echo ""
echo "  Backup file : $BACKUP_FILE ($BACKUP_SIZE)"
echo "  Target DB   : $DB_NAME"
echo "  DB user     : $DB_USER"
echo "  Mode        : $MODE"
if [[ "$MODE" == "docker" ]]; then
  echo "  Compose     : $COMPOSE_FILE"
  echo "  Service     : $DB_SERVICE"
  echo "  Container   : ${CONTAINER}"
else
  echo "  Host        : $DB_HOST:$DB_PORT"
fi
echo ""
echo "  WARNING: This will DROP and RECREATE the database '$DB_NAME'."
echo "           All existing data will be permanently deleted."
echo ""

if [[ "$FORCE" != "true" ]]; then
  read -r -p "  Type 'yes' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    log "Restore cancelled by user."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Helper: run psql command
# ---------------------------------------------------------------------------
run_psql() {
  local sql="$1"
  local target_db="${2:-postgres}"

  if [[ "$MODE" == "docker" ]]; then
    docker exec -i "$CONTAINER" \
      env PGPASSWORD="$DB_PASSWORD" \
      psql -U "$DB_USER" -d "$target_db" -c "$sql"
  else
    PGPASSWORD="$DB_PASSWORD" psql \
      -h "$DB_HOST" -p "$DB_PORT" \
      -U "$DB_USER" -d "$target_db" \
      -c "$sql"
  fi
}

# ---------------------------------------------------------------------------
# Drop and recreate the database
# ---------------------------------------------------------------------------
log "Dropping existing database '$DB_NAME'..."
run_psql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" postgres
run_psql "DROP DATABASE IF EXISTS \"${DB_NAME}\";" postgres

log "Creating fresh database '$DB_NAME'..."
run_psql "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";" postgres

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
log "Restoring from $BACKUP_FILE..."

if [[ "$MODE" == "docker" ]]; then
  gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" \
    env PGPASSWORD="$DB_PASSWORD" \
    psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
else
  PGPASSWORD="$DB_PASSWORD" gunzip -c "$BACKUP_FILE" | psql \
    -h "$DB_HOST" -p "$DB_PORT" \
    -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1
fi

log "Restore SQL executed."

# ---------------------------------------------------------------------------
# Verify: count tables
# ---------------------------------------------------------------------------
log "Verifying restore..."

TABLE_COUNT_SQL="SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"

if [[ "$MODE" == "docker" ]]; then
  TABLE_COUNT="$(docker exec -i "$CONTAINER" \
    env PGPASSWORD="$DB_PASSWORD" \
    psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$TABLE_COUNT_SQL")"
else
  TABLE_COUNT="$(PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" -p "$DB_PORT" \
    -U "$DB_USER" -d "$DB_NAME" \
    -t -A -c "$TABLE_COUNT_SQL")"
fi

TABLE_COUNT="$(echo "$TABLE_COUNT" | tr -d '[:space:]')"

if [[ -z "$TABLE_COUNT" || "$TABLE_COUNT" -eq 0 ]]; then
  log_error "Verification failed: no tables found in '$DB_NAME' after restore."
  log_error "The restore may have been incomplete or the backup may be empty."
  exit 1
fi

log "Verification passed: $TABLE_COUNT table(s) found in '$DB_NAME'."
log "Restore completed successfully."
