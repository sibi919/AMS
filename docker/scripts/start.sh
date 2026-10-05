#!/usr/bin/env bash
# Starts the whole JOAB Academy stack. This is the only start command you need.
#
#   bash docker/scripts/start.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

docker info >/dev/null 2>&1 || {
  echo "Docker is not running. Start it with: sudo systemctl start docker"
  exit 1
}

[[ -f .env ]] || bash docker/scripts/init-env.sh
set -a; . ./.env; set +a
port="${APP_PORT:-8000}"

# A port conflict is the usual cause of a failed start. Check it before pulling
# anything, and ignore our own gateway if it is already up.
if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
  exec 3<&- 2>/dev/null || true
  if [[ "$(docker ps -q -f name=^joab-gateway$)" == "" ]]; then
    echo "Port ${port} is already used by something else on this machine."
    echo "Pick a free port instead:"
    echo "  bash docker/scripts/init-env.sh --force --port 8100"
    echo "(that regenerates .env; your database and files are not touched)"
    exit 1
  fi
fi

echo "Starting containers (the first run downloads several GB of images)..."
docker compose up -d --build

echo "Waiting for the stack to become healthy..."
deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
  if docker compose exec -T gateway wget -q -O /dev/null http://127.0.0.1:8000/ 2>/dev/null; then
    break
  fi
  sleep 3
done
if (( SECONDS >= deadline )); then
  echo "The gateway did not become ready. Check docker compose ps and logs."
  exit 1
fi

echo
docker compose ps
echo
if docker compose logs migrate 2>/dev/null | grep -q "migrate: done"; then
  echo "Database migrations: applied."
else
  echo "Database migrations: still running or failed — check 'docker compose logs migrate'."
fi
echo
echo "Open the application:   http://localhost:${port}"
echo "Recovery emails:        http://localhost:${MAIL_UI_PORT:-8025}"
echo "First time? Create the first Admin: bash docker/scripts/create-admin.sh"
