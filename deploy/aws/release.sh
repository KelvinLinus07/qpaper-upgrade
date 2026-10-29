#!/usr/bin/env bash
# Full release: push backend image, register task revision, migrate, deploy, publish static frontend.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF="$ROOT/deploy/aws/terraform"
for cmd in aws docker terraform jq npm; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }; done
cd "$TF"
REPO="$(terraform output -raw ecr_repository_url)"
REGION="$(echo "$REPO" | cut -d. -f4)"
CLUSTER="$(terraform output -raw ecs_cluster)"
SERVICE="$(terraform output -raw ecs_service)"
FAMILY="$(terraform output -raw ecs_task_family)"
BUCKET="$(terraform output -raw site_bucket)"
DISTRIBUTION="$(terraform output -raw cloudfront_distribution_id)"
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short=12 HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE="$REPO:$TAG"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build --platform linux/amd64 -f "$ROOT/server/Dockerfile" -t "$IMAGE" "$ROOT/server"
docker push "$IMAGE"
aws ecs describe-task-definition --region "$REGION" --task-definition "$FAMILY" --query taskDefinition --output json \
 | jq --arg image "$IMAGE" 'del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy,.deregisteredAt) | .containerDefinitions |= map(if .name=="api" then .image=$image else . end)' > /tmp/qpaper-task.json
TASK_DEF="$(aws ecs register-task-definition --region "$REGION" --cli-input-json file:///tmp/qpaper-task.json --query 'taskDefinition.taskDefinitionArn' --output text)"
rm -f /tmp/qpaper-task.json
"$ROOT/deploy/aws/run-task.sh" "$TASK_DEF" migrate
if [[ "${BOOTSTRAP_ADMIN:-false}" == "true" ]]; then "$ROOT/deploy/aws/run-task.sh" "$TASK_DEF" bootstrap; fi
aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$SERVICE" --task-definition "$TASK_DEF" --force-new-deployment >/dev/null
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE"
cd "$ROOT"
if [[ -f package-lock.json ]]; then npm ci; else npm install --no-audit --no-fund; fi
VITE_ALLOW_SELF_REGISTRATION="$(cd "$TF" && terraform output -raw allow_self_registration)" npm run build
# Immutable JS/CSS asset paths; HTML entrypoint must always revalidate.
aws s3 sync dist/ "s3://$BUCKET/" --exclude 'index.html' --cache-control 'public,max-age=31536000,immutable'
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --cache-control 'no-cache,no-store,must-revalidate' --content-type 'text/html'
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths '/' '/index.html' >/dev/null
printf '\nDeployed image %s\nWebsite: %s\n' "$IMAGE" "$(cd "$TF" && terraform output -raw site_url)"
