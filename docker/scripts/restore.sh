#!/usr/bin/env bash
# Restores a backup created by docker/scripts/backup.sh — on this machine or on
# a new one.
#
#   bash docker/scripts/restore.sh backups/joab-backup-20260101-120000
#
# This REPLACES the current local database and uploaded files, so it asks for
# confirmation first. Use it on a fresh machine, or when you deliberately want
# to roll back to the backup.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
src="${1:-}"
[[ -n "$src" && -d "$src" ]] || { echo "Usage: bash docker/scripts/restore.sh <backup-folder>"; exit 1; }
[[ -f "$src/db-data.tar.gz" ]] || { echo "No db-data.tar.gz in $src"; exit 1; }

echo "This will replace the database and uploaded files in this installation"
echo "with the backup in: $src"
read -r -p 'Type RESTORE to continue: ' confirm
[[ "$confirm" == "RESTORE" ]] || { echo "Cancelled."; exit 1; }

if [[ -f "$src/env.backup" ]]; then
  if [[ -f .env ]]; then
    mkdir -p backups
    cp .env "backups/env-before-restore-$(date +%Y%m%d-%H%M%S).private"
    chmod 600 backups/env-before-restore-*.private
  fi
  cp "$src/env.backup" .env
  chmod 600 .env
  echo "Restored .env from the backup."
fi

echo "Stopping containers..."
docker compose down >/dev/null 2>&1 || true

# Volumes are created by compose on first start; create them here if this is a
# brand-new machine so the restore has somewhere to go.
docker volume create joab-academy_joab_db_data >/dev/null
docker volume create joab-academy_joab_storage_data >/dev/null
docker volume create joab-academy_joab_db_config >/dev/null

restore_volume() {
  local volume="$1" file="$2"
  [[ -f "$file" ]] || { echo "  skipping $(basename "$file") (not in backup)"; return; }
  echo "  $(basename "$file") -> $volume"
  docker run --rm \
    -v "${volume}:/data" \
    -v "$(cd "$(dirname "$file")" && pwd):/backup:ro" \
    alpine:3.20 sh -c "rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/$(basename "$file") -C /data"
}

echo "Restoring volumes..."
restore_volume joab-academy_joab_db_data "$src/db-data.tar.gz"
restore_volume joab-academy_joab_storage_data "$src/storage-data.tar.gz"
restore_volume joab-academy_joab_db_config "$src/db-config.tar.gz"

echo
echo "Restored. Start the application with: bash docker/scripts/start.sh"
