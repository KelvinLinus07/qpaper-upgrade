#!/usr/bin/env bash
# Execute migration/bootstrap as an isolated Fargate one-off task, verify exit code.
set -euo pipefail
[[ $# -ge 2 ]] || { echo "Usage: $0 TASK_DEFINITION_ARN migrate|bootstrap" >&2; exit 2; }
TASK_DEF="$1"
ACTION="$2"
TF="$(cd "$(dirname "${BASH_SOURCE[0]}")/terraform" && pwd)"
cd "$TF"
CLUSTER="$(terraform output -raw ecs_cluster)"
SG="$(terraform output -raw api_security_group)"
REGION="$(terraform output -raw ecr_repository_url | cut -d. -f4)"
SUBNETS="$(terraform output -json api_subnets | jq -c '.')"
NETWORK="$(jq -cn --argjson subnets "$SUBNETS" --arg sg "$SG" '{awsvpcConfiguration:{subnets:$subnets,securityGroups:[$sg],assignPublicIp:"ENABLED"}}')"
case "$ACTION" in
  migrate) CMD='["node","src/migrate.js"]' ;;
  bootstrap) CMD='["node","src/bootstrapAdmin.js"]' ;;
  *) echo "Unknown action: $ACTION" >&2; exit 2 ;;
esac
OVERRIDES="$(jq -cn --argjson command "$CMD" '{containerOverrides:[{name:"api",command:$command}]}')"
RESULT="$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --task-definition "$TASK_DEF" --launch-type FARGATE --network-configuration "$NETWORK" --overrides "$OVERRIDES" --output json)"
if [[ "$(echo "$RESULT" | jq -r '.failures|length')" != "0" ]]; then echo "$RESULT" | jq .; exit 1; fi
ARN="$(echo "$RESULT" | jq -r '.tasks[0].taskArn // empty')"
[[ -n "$ARN" ]] || { echo "No task started" >&2; exit 1; }
echo "Running $ACTION task: $ARN"
aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$ARN"
STATUS="$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$ARN" --query 'tasks[0].containers[0].[exitCode,reason]' --output json)"
echo "Task result: $STATUS"
[[ "$(echo "$STATUS" | jq '.[0]')" == "0" ]] || { echo "Task failed. Check CloudWatch ECS logs." >&2; exit 1; }
