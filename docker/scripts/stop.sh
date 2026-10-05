#!/usr/bin/env bash
# Stops the stack. Your database and uploaded files are kept in Docker volumes.
#
#   bash docker/scripts/stop.sh
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

docker compose stop
echo "Stopped. Start again with: bash docker/scripts/start.sh"
echo "Data is kept. Only 'docker compose down -v' would delete it — never run that."
