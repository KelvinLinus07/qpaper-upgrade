#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then echo 'Run ./deploy/docker/setup.sh first.' >&2; exit 1; fi
if [[ ! -t 0 ]]; then echo 'This script requires an interactive terminal.' >&2; exit 1; fi
read -r -p 'Admin email: ' email
read -r -p 'Admin display name [Administrator]: ' name
name="${name:-Administrator}"
read -r -s -p 'Admin password (12+ characters): ' password
printf '\n'
if [[ ${#password} -lt 12 ]]; then echo 'Password must be at least 12 characters.' >&2; exit 1; fi
if [[ ! "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then echo 'A valid admin email is required.' >&2; exit 1; fi
# One-off credentials are never kept in .env or in Compose's long-running API.
docker compose run --rm -e ADMIN_EMAIL="$email" -e ADMIN_PASSWORD="$password" -e ADMIN_NAME="$name" api node src/seedAdmin.js
unset password
printf 'Admin configured. Sign in at the APP_URL configured in .env.\n'
