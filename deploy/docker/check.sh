#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then echo 'Missing .env; run setup.sh.' >&2; exit 1; fi
# Uses exact APP_URL line; spaces and embedded shell expressions are not evaluated.
url="$(sed -n 's/^APP_URL=//p' .env | tail -n 1)"
url="${url%/}"
if [[ -z "$url" ]]; then echo 'APP_URL is empty.' >&2; exit 1; fi
printf 'Checking %s ...\n' "$url"
curl --fail --silent --show-error --max-time 20 "$url/api/health"
printf '\n'
curl --fail --silent --show-error --max-time 20 -o /dev/null "$url/"
echo 'Frontend and database-backed API health checks passed.'
