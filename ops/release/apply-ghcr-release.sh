#!/usr/bin/env bash
set -euo pipefail

# Pulls an already-approved release. It never builds application code locally.
# Usage: ./apply-ghcr-release.sh <git-sha>

RELEASE_ID=${1:?release id is required}
BASE_COMPOSE=${BASE_COMPOSE:-/opt/ticketz/docker-compose.yml}
LOCAL_OVERRIDE=${LOCAL_OVERRIDE:-/opt/ticketz/docker-compose.override.yml}
RELEASE_OVERRIDE=${RELEASE_OVERRIDE:-$HOME/chat-crm-release/docker-compose.ghcr.yml}
REGISTRY_NAMESPACE=${REGISTRY_NAMESPACE:-ghcr.io/laukdan5566}

[[ "$RELEASE_ID" =~ ^[A-Fa-f0-9]{7,40}$ ]]
test -f "$BASE_COMPOSE"
test -f "$LOCAL_OVERRIDE"
test -f "$RELEASE_OVERRIDE"

export BACKEND_IMAGE="$REGISTRY_NAMESPACE/chat-backend:$RELEASE_ID"
export FRONTEND_IMAGE="$REGISTRY_NAMESPACE/chat-frontend:$RELEASE_ID"

old_backend=$(docker inspect -f '{{.Config.Image}}' ticketz_backend)
old_frontend=$(docker inspect -f '{{.Config.Image}}' ticketz_frontend)
rollback_file="$HOME/chat-crm-release/rollback-$(date +%Y%m%d-%H%M%S).env"
mkdir -p "$(dirname "$rollback_file")"
printf 'BACKEND_IMAGE=%s\nFRONTEND_IMAGE=%s\n' "$old_backend" "$old_frontend" > "$rollback_file"

docker compose -f "$BASE_COMPOSE" -f "$LOCAL_OVERRIDE" -f "$RELEASE_OVERRIDE" pull backend frontend
docker compose -f "$BASE_COMPOSE" -f "$LOCAL_OVERRIDE" -f "$RELEASE_OVERRIDE" \
  up -d --no-build --force-recreate --no-deps backend frontend

echo "Release $RELEASE_ID active. Rollback image references: $rollback_file"
