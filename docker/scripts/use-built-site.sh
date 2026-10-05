#!/usr/bin/env bash
# Switches the stack between the development server and the built site.
# The built site is the right choice for handing the package to a customer:
# it is faster, uses less memory and has no development tooling running.
#
#   bash docker/scripts/use-built-site.sh on    # serve the built site
#   bash docker/scripts/use-built-site.sh off   # back to the dev server
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:-}"
[[ -f .env ]] || { echo "No .env yet. Run: bash docker/scripts/start.sh"; exit 1; }

case "$mode" in
  on)
    sed -i 's|^FRONTEND_UPSTREAM=.*|FRONTEND_UPSTREAM=frontend-prod:8080|' .env
    echo "Building the site (this takes a couple of minutes)..."
    docker compose --profile prod up -d --build frontend-prod
    docker compose up -d --force-recreate gateway
    docker compose stop frontend
    ;;
  off)
    sed -i 's|^FRONTEND_UPSTREAM=.*|FRONTEND_UPSTREAM=frontend:5173|' .env
    docker compose up -d frontend
    docker compose up -d --force-recreate gateway
    docker compose --profile prod stop frontend-prod || true
    ;;
  *)
    echo "Usage: bash docker/scripts/use-built-site.sh on|off"
    exit 1
    ;;
esac

set -a; . ./.env; set +a
echo "Done. Open ${PUBLIC_URL:-http://localhost:8000}"
