#!/usr/bin/env bash
set -euo pipefail

# Pulls an already-approved release. It never builds application code locally.
# Usage: ./apply-ghcr-release.sh <image-tag>

RELEASE_TAG=${1:?image tag is required}
BASE_COMPOSE=${BASE_COMPOSE:-/opt/ticketz/docker-compose.yml}
LOCAL_OVERRIDE=${LOCAL_OVERRIDE:-/opt/ticketz/docker-compose.override.yml}
RELEASE_OVERRIDE=${RELEASE_OVERRIDE:-/opt/ticketz/docker-compose.ghcr.yml}
REGISTRY_NAMESPACE=${REGISTRY_NAMESPACE:-ghcr.io/laukdan5566}

[[ "$RELEASE_TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]
test -f "$BASE_COMPOSE"
test -f "$LOCAL_OVERRIDE"
test -f "$RELEASE_OVERRIDE"

export BACKEND_IMAGE="$REGISTRY_NAMESPACE/chat-backend:$RELEASE_TAG"
export FRONTEND_IMAGE="$REGISTRY_NAMESPACE/chat-frontend:$RELEASE_TAG"

compose=(docker compose -f "$BASE_COMPOSE" -f "$LOCAL_OVERRIDE" -f "$RELEASE_OVERRIDE")
backend_container=$("${compose[@]}" ps -q backend)
frontend_container=$("${compose[@]}" ps -q frontend)
test -n "$backend_container"
test -n "$frontend_container"

old_backend=$(docker inspect -f '{{.Config.Image}}' "$backend_container")
old_frontend=$(docker inspect -f '{{.Config.Image}}' "$frontend_container")
rollback_file="$HOME/chat-crm-release/rollback-$(date +%Y%m%d-%H%M%S).env"
mkdir -p "$(dirname "$rollback_file")"
printf 'BACKEND_IMAGE=%s\nFRONTEND_IMAGE=%s\n' "$old_backend" "$old_frontend" > "$rollback_file"

restore() {
  BACKEND_IMAGE="$old_backend" FRONTEND_IMAGE="$old_frontend" \
    "${compose[@]}" up -d --pull never --no-build --force-recreate --no-deps backend frontend || true
}

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  "${compose[@]}" pull backend frontend
fi

if ! "${compose[@]}" \
  up -d --pull never --no-build --force-recreate --no-deps backend frontend; then
  restore
  exit 1
fi

backend_container=$("${compose[@]}" ps -q backend)
frontend_container=$("${compose[@]}" ps -q frontend)
test -n "$backend_container"
test -n "$frontend_container"

ready=0
for _ in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$backend_container" 2>/dev/null)" = true ] \
    && [ "$(docker inspect -f '{{.State.Running}}' "$frontend_container" 2>/dev/null)" = true ] \
    && curl -fsS http://127.0.0.1:3000/ >/dev/null \
    && curl -fsS http://127.0.0.1:8080/ >/dev/null; then
    ready=1
    break
  fi
  sleep 4
done

if [ "$ready" -ne 1 ]; then
  echo "Release validation failed. Restoring previous images."
  restore
  exit 1
fi

echo "Release $RELEASE_TAG active. Rollback image references: $rollback_file"
