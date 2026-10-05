#!/usr/bin/env bash
# Shows live logs. Optionally for one service:
#
#   bash docker/scripts/logs.sh            # everything
#   bash docker/scripts/logs.sh auth       # just Supabase Auth
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose logs -f --tail=100 "$@"
