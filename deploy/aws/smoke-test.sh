#!/usr/bin/env bash
set -euo pipefail
URL="${1:?Usage: smoke-test.sh https://papers.example.com}"
URL="${URL%/}"
for path in / /index.html /api/health/live /api/health /api/institution; do
  echo "GET ${URL}${path}"
  curl --fail --silent --show-error --location --max-time 15 -o /dev/null -w 'HTTP %{http_code} in %{time_total}s\n' "${URL}${path}"
done
# API auth must not be publicly accessible; 401 is expected.
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/auth/me")"
[[ "$CODE" == 401 ]] || { echo "Expected 401 from /api/auth/me, got $CODE" >&2; exit 1; }
echo 'Public pages, database readiness, and unauthenticated access check passed.'
