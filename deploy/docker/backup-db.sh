#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then echo 'Missing .env' >&2; exit 1; fi
umask 077
mkdir -p backups
filename="backups/qpaper-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Custom-format pg_dump; PostgreSQL is never published to a host port.
if ! docker compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$filename"; then
  rm -f "$filename"
  echo 'Backup failed.' >&2
  exit 1
fi
if [[ ! -s "$filename" ]]; then rm -f "$filename"; echo 'Empty backup' >&2; exit 1; fi
printf 'Backup created: %s\n' "$filename"
echo 'Copy it off the host securely. Backups stored only on the server are not disaster recovery.'
