#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/repair_map2_sqlite.sh [--db PATH] [--out-dir PATH] [--apply]

Purpose:
  Offline repair/rotation path for malformed MAP2 SQLite databases using
  sqlite3 .recover.

Behavior:
  - Default mode is dry-run (no changes).
  - In --apply mode:
    1) Verifies DB is not actively in use
    2) Backs up DB (+ WAL/SHM if present)
    3) Runs sqlite3 .recover into a new DB
    4) Validates recovered DB with PRAGMA quick_check
    5) Replaces original DB atomically with recovered copy

Examples:
  scripts/repair_map2_sqlite.sh
  scripts/repair_map2_sqlite.sh --apply
  scripts/repair_map2_sqlite.sh --db /path/to/map2.db --apply
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${ROOT_DIR}/data/map2.db"
OUT_DIR=""
APPLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB_PATH="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 is required but not installed." >&2
  exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: Database not found at: $DB_PATH" >&2
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="${ROOT_DIR}/data/repair-backups/${TS}"
fi

QUICK_CHECK_OUTPUT="$(sqlite3 "$DB_PATH" "PRAGMA quick_check;" 2>&1 || true)"
if [[ "$QUICK_CHECK_OUTPUT" == "ok" ]]; then
  echo "Database quick_check: ok"
  echo "No repair needed."
  exit 0
fi

echo "Database quick_check reported issues:"
echo "$QUICK_CHECK_OUTPUT" | sed 's/^/  /'

if [[ "$APPLY" -ne 1 ]]; then
  echo
  echo "Dry-run only. No changes applied."
  echo "Stop backend service first, then run:"
  echo "  scripts/repair_map2_sqlite.sh --db \"$DB_PATH\" --apply"
  exit 3
fi

# Safety: do not run repair while DB is in active use.
if command -v fuser >/dev/null 2>&1; then
  if fuser "$DB_PATH" >/dev/null 2>&1; then
    echo "ERROR: Database appears in use: $DB_PATH" >&2
    echo "Stop MAP2 backend service before --apply and retry." >&2
    exit 4
  fi
fi

mkdir -p "$OUT_DIR"
BACKUP_DB="${OUT_DIR}/map2.db.corrupt.backup"
BACKUP_WAL="${OUT_DIR}/map2.db-wal.corrupt.backup"
BACKUP_SHM="${OUT_DIR}/map2.db-shm.corrupt.backup"
SQL_DUMP="${OUT_DIR}/recovered.sql"
RECOVERED_DB="${OUT_DIR}/map2.db.recovered"
RECOVER_LOG="${OUT_DIR}/recover.log"
PRE_REPAIR_DB="${OUT_DIR}/map2.db.pre_repair"
PRE_REPAIR_WAL="${OUT_DIR}/map2.db-wal.pre_repair"
PRE_REPAIR_SHM="${OUT_DIR}/map2.db-shm.pre_repair"

cp -a "$DB_PATH" "$BACKUP_DB"
if [[ -f "${DB_PATH}-wal" ]]; then
  cp -a "${DB_PATH}-wal" "$BACKUP_WAL"
fi
if [[ -f "${DB_PATH}-shm" ]]; then
  cp -a "${DB_PATH}-shm" "$BACKUP_SHM"
fi

echo "Running sqlite3 .recover ..."
sqlite3 "$DB_PATH" ".recover" > "$SQL_DUMP" 2> "$RECOVER_LOG"

rm -f "$RECOVERED_DB"
echo "Rebuilding recovered database ..."
sqlite3 "$RECOVERED_DB" < "$SQL_DUMP" >> "$RECOVER_LOG" 2>&1

NEW_QUICK_CHECK="$(sqlite3 "$RECOVERED_DB" "PRAGMA quick_check;" 2>&1 || true)"
if [[ "$NEW_QUICK_CHECK" != "ok" ]]; then
  echo "ERROR: Recovered DB quick_check failed:" >&2
  echo "$NEW_QUICK_CHECK" >&2
  echo "Repair artifacts kept in: $OUT_DIR" >&2
  exit 5
fi

mv "$DB_PATH" "$PRE_REPAIR_DB"
if [[ -f "${DB_PATH}-wal" ]]; then
  mv "${DB_PATH}-wal" "$PRE_REPAIR_WAL"
fi
if [[ -f "${DB_PATH}-shm" ]]; then
  mv "${DB_PATH}-shm" "$PRE_REPAIR_SHM"
fi

cp -a "$RECOVERED_DB" "$DB_PATH"
sqlite3 "$DB_PATH" "PRAGMA optimize;" >/dev/null 2>&1 || true

POST_CHECK="$(sqlite3 "$DB_PATH" "PRAGMA quick_check;" 2>&1 || true)"
if [[ "$POST_CHECK" != "ok" ]]; then
  echo "ERROR: Post-repair quick_check failed on active DB copy." >&2
  echo "$POST_CHECK" >&2
  echo "Original DB is preserved at: $PRE_REPAIR_DB" >&2
  exit 6
fi

echo "Repair complete."
echo "  Active DB:       $DB_PATH"
echo "  Backup artifacts: $OUT_DIR"
echo "  Recovery log:     $RECOVER_LOG"
echo "Post-repair quick_check: ok"
