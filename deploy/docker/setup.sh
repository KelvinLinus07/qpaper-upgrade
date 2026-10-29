#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ -e .env ]]; then
  echo 'Existing .env preserved. Edit it if you want to configure a domain or S3.'
  exit 0
fi
if command -v openssl >/dev/null 2>&1; then
  random_secret() { openssl rand -hex 32; }
elif command -v python3 >/dev/null 2>&1; then
  random_secret() { python3 -c 'import secrets; print(secrets.token_hex(32))'; }
else
  echo 'Install openssl or python3 to generate secure credentials.' >&2
  exit 1
fi
cp deploy/docker/.env.example .env
chmod 600 .env
postgres_password="$(random_secret)"
jwt_secret="$(random_secret)"
# Random values are hex only, safe for sed replacement and Compose .env parsing.
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${postgres_password}/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${jwt_secret}/" .env
printf '%s\n' 'Created .env with unique database and JWT secrets (permissions 600).' \
 'Defaults are for LOCAL TESTING on http://localhost:8080 only.' \
 'For an internet-facing deployment: change APP_URL, SITE_ADDRESS,' \
 'HTTP_PORT, HTTPS_PORT and COOKIE_SECURE as described in deploy/docker/README.md.'
