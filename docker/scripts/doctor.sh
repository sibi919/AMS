#!/usr/bin/env bash
# Checks every part of the stack and says which one is actually broken.
# Run this first whenever sign-in or the portal misbehaves.
#
#   bash docker/scripts/doctor.sh
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

[[ -f .env ]] || { echo "No .env. Run: bash docker/scripts/start.sh"; exit 1; }
set -a; . ./.env; set +a
base="${PUBLIC_URL:-http://localhost:${APP_PORT:-8000}}"
key="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"

check() { # name, url, extra curl args...
  local name="$1" url="$2"; shift 2
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$url" 2>/dev/null)
  if [[ "$code" =~ ^(200|201|204|404)$ ]]; then
    printf '  OK    %-28s %s\n' "$name" "$code"
  elif [[ -z "$code" || "$code" == "000" ]]; then
    printf '  FAIL  %-28s no response (service down or wrong port)\n' "$name"
  else
    printf '  WARN  %-28s HTTP %s\n' "$name" "$code"
  fi
}

echo "Containers"
docker compose ps --format '  {{.Service}}\t{{.Status}}' 2>/dev/null || echo "  docker compose not available"

echo
echo "Configuration"
printf '  application URL              %s\n' "$base"
if [[ "$key" == sb_publishable_* ]]; then
  printf '  publishable key             looks correct (%s…)\n' "${key:0:22}"
else
  printf '  publishable key             WRONG FORMAT — must start with sb_publishable_\n'
fi
[[ "${VITE_SUPABASE_URL:-}" == "$base" ]] \
  && echo "  VITE_SUPABASE_URL           matches the application URL" \
  || echo "  VITE_SUPABASE_URL           MISMATCH: ${VITE_SUPABASE_URL:-unset} (should be $base)"

echo
echo "Endpoints through the gateway"
check "application page"      "$base/"
check "auth (GoTrue)"         "$base/auth/v1/health" -H "apikey: $key"
check "database API"          "$base/rest/v1/" -H "apikey: $key" -H "Authorization: Bearer $key"
check "storage"               "$base/storage/v1/status"
check "edge function"         "$base/functions/v1/create-account" \
      -X OPTIONS -H "Origin: $base"
check "mail viewer"           "http://localhost:${MAIL_UI_PORT:-8025}/"

echo
echo "Database"
if docker compose exec -T db psql -U postgres -d postgres -tAc \
     "select 'profiles=' || count(*) from public.profiles" 2>/dev/null; then
  docker compose exec -T db psql -U postgres -d postgres -tAc \
    "select '  admins=' || count(*) from public.profiles where role='admin'" 2>/dev/null
  docker compose exec -T db psql -U postgres -d postgres -tAc \
    "select '  migrations applied=' || count(*) from joab_docker.applied_migrations" 2>/dev/null
else
  echo "  Could not query the database — see: bash docker/scripts/logs.sh db"
fi

echo
echo "If sign-in fails but everything above is OK, the email or password is"
echo "genuinely wrong. Check 'bash docker/scripts/logs.sh auth' for the exact"
echo "reason recorded by Supabase Auth."
