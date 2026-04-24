#!/usr/bin/env bash
# Dump the chatroy Postgres database to a timestamped gzip file.
#
# Usage:
#   ./scripts/backup-db.sh [output-dir]
#
# Output dir defaults to ./backups. The script creates it if it doesn't exist.
# Reads POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB from .env if present.
#
# Restore:
#   gunzip -c <backup-file> | docker compose exec -T postgres \
#     psql -U "$POSTGRES_USER" "$POSTGRES_DB"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load .env if present (best-effort; export so docker compose can read them)
if [[ -f "${REPO_ROOT}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-roy}"
POSTGRES_DB="${POSTGRES_DB:-roy}"
BACKUP_DIR="${1:-${REPO_ROOT}/backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/roy-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "Backing up database '${POSTGRES_DB}' to ${BACKUP_FILE} ..."

docker compose -f "${REPO_ROOT}/docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "Done. Backup size: ${SIZE}"
echo ""
echo "To restore:"
echo "  gunzip -c ${BACKUP_FILE} | docker compose exec -T postgres psql -U ${POSTGRES_USER} ${POSTGRES_DB}"
