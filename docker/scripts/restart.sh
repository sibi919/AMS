#!/usr/bin/env bash
# Restarts the running containers without touching any data.
#
#   bash docker/scripts/restart.sh
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose restart
docker compose ps
