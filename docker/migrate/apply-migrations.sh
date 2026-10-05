#!/bin/sh
# Applies supabase/migrations/*.sql once each, in filename order.
#
# Safety rules built in:
#   - never drops, resets or re-runs an already applied migration
#   - each file runs inside one transaction together with its bookkeeping row,
#     so a failure leaves nothing half-applied
#   - waits until Auth and Storage have created their own schemas, because the
#     project's migrations reference auth.users and storage.objects
set -eu

export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL="psql -v ON_ERROR_STOP=1 -h db -U postgres -d postgres -X -q"

echo "migrate: waiting for auth.users and storage.objects..."
i=0
while [ "$($PSQL -tAc "select (to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null)")" != "t" ]; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "migrate: auth/storage schemas did not appear in time. Check 'docker compose logs auth storage'." >&2
    exit 1
  fi
  sleep 2
done

# Bookkeeping lives in its own schema, not in public, so PostgREST never
# exposes it and the application schema stays exactly as the project defines it.
$PSQL -c "create schema if not exists joab_docker;"
$PSQL -c "create table if not exists joab_docker.applied_migrations (
            filename text primary key,
            applied_at timestamptz not null default now());"

applied=0
for file in /migrations/*.sql; do
  name=$(basename "$file")
  if [ "$($PSQL -tAc "select count(*) from joab_docker.applied_migrations where filename = '$name'")" = "1" ]; then
    echo "migrate: already applied, skipping $name"
    continue
  fi
  echo "migrate: applying $name"
  {
    cat "$file"
    printf "\ninsert into joab_docker.applied_migrations(filename) values ('%s');\n" "$name"
  } > /tmp/migration.sql
  $PSQL -1 -f /tmp/migration.sql
  applied=$((applied + 1))
done

echo "migrate: done ($applied newly applied)"
