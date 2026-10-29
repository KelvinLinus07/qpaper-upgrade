#!/usr/bin/env bash
# Run once before the first full terraform apply so ECS has an image to start.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF="$ROOT/deploy/aws/terraform"
command -v terraform >/dev/null; command -v docker >/dev/null; command -v aws >/dev/null
cd "$TF"
terraform init
terraform apply -target=aws_ecr_repository.api
REGION="$(terraform output -raw ecr_repository_url 2>/dev/null | cut -d. -f4 || true)"
REPO="$(terraform output -raw ecr_repository_url 2>/dev/null || true)"
if [[ -z "$REPO" ]]; then
  # When using targeted terraform apply, outputs can refer to resources not yet in state.
  AWS_REGION="$(aws configure get region || true)"
  AWS_REGION="${AWS_REGION:-ap-south-1}"
  ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
  ENVIRONMENT="${ENVIRONMENT:-production}"
  REPO="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/qpaper-$ENVIRONMENT-api"
fi
AWS_REGION="$(echo "$REPO" | cut -d. -f4)"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build --platform linux/amd64 -f "$ROOT/server/Dockerfile" -t "$REPO:bootstrap" "$ROOT/server"
docker push "$REPO:bootstrap"
printf '\nBootstrap image pushed: %s\nRun full terraform apply next.\n' "$REPO:bootstrap"
