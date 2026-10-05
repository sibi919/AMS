#!/usr/bin/env bash
# Backs up everything that is NOT in the project ZIP: the live database, the
# uploaded files, and the local keys needed to read them back.
#
#   bash docker/scripts/backup.sh                 # into ./backups
#   bash docker/scripts/backup.sh /media/usb/joab # into another folder
#
# Nothing is deleted. The database and storage containers are paused for a few
# seconds so the copy is consistent, then started again.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dest="${1:-$PWD/backups}"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dest"
out="$(cd "$dest" && pwd)/joab-backup-$stamp"
mkdir -m 700 -p "$out"

echo "Pausing database and storage for a consistent copy..."
trap 'docker compose start db storage >/dev/null' EXIT
docker compose stop db storage >/dev/null

copy_volume() {
  local volume="$1" file="$2"
  echo "  $volume -> $(basename "$file")"
  docker run --rm \
    -v "${volume}:/data:ro" \
    -v "$out:/backup" \
    alpine:3.20 tar czf "/backup/$(basename "$file")" -C /data .
}

echo "Copying volumes..."
copy_volume joab-academy_joab_db_data db-data.tar.gz
copy_volume joab-academy_joab_storage_data storage-data.tar.gz
copy_volume joab-academy_joab_db_config db-config.tar.gz

if [[ -f .env ]]; then
  cp .env "$out/env.backup"
  chmod 600 "$out/env.backup"
  echo "  .env -> env.backup (contains this machine's keys — keep it private)"
fi

cat > "$out/README.txt" <<EOF
JOAB Academy backup taken $stamp

db-data.tar.gz       PostgreSQL data directory (accounts, profiles, attendance,
                     marks, lessons, audit logs)
storage-data.tar.gz  Uploaded files, including profile photos
env.backup           The local keys for this installation. Restore it as .env
                     on the target machine, or existing sessions and the
                     gateway key will not match.

Restore on any machine that has this project and Docker:
  bash docker/scripts/restore.sh <this-folder>
EOF

echo "Restarting services..."
docker compose start db storage >/dev/null
trap - EXIT

echo
echo "Backup complete: $out"
du -sh "$out"
