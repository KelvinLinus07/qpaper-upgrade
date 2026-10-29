#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then echo 'Missing .env; run setup.sh.' >&2; exit 1; fi
./deploy/docker/backup-db.sh
# Rebuild all app images, rerun additive SQL migrations and recreate changed containers.
docker compose up -d --build --remove-orphans
docker compose ps
./deploy/docker/check.sh
