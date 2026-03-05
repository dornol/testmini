#!/usr/bin/env bash
# pg-backup.sh — PostgreSQL backup script for testmini
#
# Usage:
#   ./pg-backup.sh [OPTIONS]
#
# Options:
#   -d, --backup-dir DIR    Directory to store backups (default: ./backups)
#   -r, --retain N          Number of backups to retain (default: 30)
#   -m, --mode MODE         Connection mode: docker (default) or direct
#   -c, --compose-file FILE Path to compose file (default: compose.prod.yaml)
#   -s, --service NAME      Docker Compose service name for db (default: db)
#   -h, --host HOST         DB host for direct mode (default: localhost)
#   -p, --port PORT         DB port for direct mode (default: 5432)
#   -U, --user USER         DB user (default: $POSTGRES_USER or testmini)
#   -P, --password PASS     DB password (default: $POSTGRES_PASSWORD)
#   -n, --dbname NAME       DB name (default: $POSTGRES_DB or testmini)
#       --help              Show this help

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN="${RETAIN:-30}"
MODE="${MODE:-docker}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-${POSTGRES_USER:-testmini}}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-testmini}}"

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
    -d|--backup-dir)    BACKUP_DIR="$2";    shift 2 ;;
    -r|--retain)        RETAIN="$2";        shift 2 ;;
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
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
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
  if ! command -v pg_dump &>/dev/null; then
    log_error "pg_dump command not found. Install postgresql-client."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Prepare backup directory
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date '+%Y-%m-%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

log "Starting PostgreSQL backup"
log "  Mode       : $MODE"
log "  Database   : $DB_NAME"
log "  User       : $DB_USER"
log "  Output     : $BACKUP_FILE"
log "  Retain     : $RETAIN backups"

# ---------------------------------------------------------------------------
# Run pg_dump
# ---------------------------------------------------------------------------
if [[ "$MODE" == "docker" ]]; then
  # Determine the container name from docker compose
  CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q "$DB_SERVICE" 2>/dev/null || true)"
  if [[ -z "$CONTAINER" ]]; then
    log_error "Could not find running container for service '$DB_SERVICE' in '$COMPOSE_FILE'."
    log_error "Make sure the stack is running: docker compose -f $COMPOSE_FILE ps"
    exit 1
  fi

  log "  Container  : $CONTAINER"

  docker exec "$CONTAINER" \
    env PGPASSWORD="${DB_PASSWORD}" \
    pg_dump -U "$DB_USER" "$DB_NAME" \
    | gzip > "$BACKUP_FILE"
else
  PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    "$DB_NAME" \
    | gzip > "$BACKUP_FILE"
fi

if [[ ! -s "$BACKUP_FILE" ]]; then
  log_error "Backup file is empty or was not created: $BACKUP_FILE"
  rm -f "$BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
log "Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"

# ---------------------------------------------------------------------------
# Retention: delete oldest backups beyond RETAIN count
# ---------------------------------------------------------------------------
log "Applying retention policy (keep last $RETAIN backups)..."

# List all backup files sorted oldest first
mapfile -t ALL_BACKUPS < <(ls -1t "${BACKUP_DIR}"/backup_*.sql.gz 2>/dev/null)
TOTAL="${#ALL_BACKUPS[@]}"

if [[ "$TOTAL" -gt "$RETAIN" ]]; then
  DELETE_COUNT=$(( TOTAL - RETAIN ))
  log "Found $TOTAL backups, deleting $DELETE_COUNT oldest..."
  # The array is sorted newest-first by ls -t; delete from the end
  for (( i = RETAIN; i < TOTAL; i++ )); do
    log "  Deleting: ${ALL_BACKUPS[$i]}"
    rm -f "${ALL_BACKUPS[$i]}"
  done
else
  log "Found $TOTAL backups, no deletion needed (limit: $RETAIN)."
fi

log "Backup process finished."
