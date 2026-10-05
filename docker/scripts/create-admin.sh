#!/usr/bin/env bash
# Creates the very first Admin account, using the project's own
# scripts/bootstrap-admin.mjs inside a container. No Node is needed on the host.
#
#   bash docker/scripts/create-admin.sh
#
# The database only allows this creator-less path while there are no profiles at
# all, and only for an Admin. Every later account must be created by a signed-in
# Admin (or authorized Staff) through the portal, so triggers, RLS and role
# permissions all still apply.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

[[ -f .env ]] || { echo "No .env yet. Run: bash docker/scripts/start.sh"; exit 1; }
set -a; . ./.env; set +a

docker compose ps --status running --services 2>/dev/null | grep -qx gateway || {
  echo "The stack is not running. Start it first: bash docker/scripts/start.sh"
  exit 1
}

echo "Creating the first Admin account."
echo "The password is typed here, never stored in a file or in shell history."
echo
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (at least 12 characters): ' ADMIN_PASSWORD; echo
read -r -p 'Admin full name: ' ADMIN_NAME
read -r -p 'Admin ID (3-32 characters, A-Z 0-9 _ -): ' ADMIN_CODE
echo

# The service-role key is read from .env and passed straight into the container,
# so it never appears on screen or in the shell history.
docker compose run --rm --no-deps \
  -e SUPABASE_URL=http://gateway:8000 \
  -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e ADMIN_NAME="$ADMIN_NAME" \
  -e ADMIN_CODE="$ADMIN_CODE" \
  frontend npm run --silent bootstrap:admin

unset ADMIN_PASSWORD
echo
echo "If that succeeded, sign in at ${PUBLIC_URL:-http://localhost:8000}/login"
