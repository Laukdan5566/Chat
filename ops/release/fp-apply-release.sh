#!/usr/bin/env bash
set -euo pipefail

# Loads a verified image archive and recreates only Ticketz frontend/backend.
# Run on production as user fp: ./fp-apply-release.sh <release-id>

RELEASE_ID=${1:?"release id is required"}
REQUESTED_RELEASE_ID=$RELEASE_ID
RELEASE_ROOT=${RELEASE_ROOT:-"$HOME/ticketz-releases"}
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
BASE_COMPOSE=${BASE_COMPOSE:-"/opt/ticketz/docker-compose.yml"}
LOCAL_OVERRIDE=${LOCAL_OVERRIDE:-"/opt/ticketz/docker-compose.override.yml"}
RUNTIME_DIR=${RUNTIME_DIR:-"$HOME/ticketz-release"}
RUNTIME_OVERRIDE="$RUNTIME_DIR/docker-compose.release.yml"
STAMP=$(date +%Y%m%d-%H%M%S)
ROLLBACK_OVERRIDE="$RUNTIME_DIR/docker-compose.rollback-$STAMP.yml"

test -f "$RELEASE_DIR/release.env"
test -f "$RELEASE_DIR/images.tar.gz"
test -f "$RELEASE_DIR/images.tar.gz.sha256"
(cd "$RELEASE_DIR" && sha256sum -c images.tar.gz.sha256)

[[ "$REQUESTED_RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]
release_value() {
  sed -n "s/^$1=//p" "$RELEASE_DIR/release.env" | tail -n 1
}
manifest_release_id=$(release_value RELEASE_ID)
BACKEND_IMAGE=$(release_value BACKEND_IMAGE)
FRONTEND_IMAGE=$(release_value FRONTEND_IMAGE)
test "$manifest_release_id" = "$REQUESTED_RELEASE_ID"
test "$BACKEND_IMAGE" = "fp-ticketz-backend:$REQUESTED_RELEASE_ID"
test "$FRONTEND_IMAGE" = "fp-ticketz-frontend:$REQUESTED_RELEASE_ID"

mkdir -p "$RUNTIME_DIR"
docker load < "$RELEASE_DIR/images.tar.gz"
docker image inspect "$BACKEND_IMAGE" >/dev/null
docker image inspect "$FRONTEND_IMAGE" >/dev/null

old_backend=$(docker inspect -f '{{.Config.Image}}' ticketz_backend 2>/dev/null || true)
old_frontend=$(docker inspect -f '{{.Config.Image}}' ticketz_frontend 2>/dev/null || true)
test -n "$old_backend"
test -n "$old_frontend"

cat > "$ROLLBACK_OVERRIDE" <<EOF
services:
  backend:
    image: $old_backend
  frontend:
    image: $old_frontend
EOF

restore() {
  cp "$ROLLBACK_OVERRIDE" "$RUNTIME_OVERRIDE"
  docker compose -f "$BASE_COMPOSE" -f "$LOCAL_OVERRIDE" -f "$RUNTIME_OVERRIDE" \
    up -d --force-recreate --no-deps backend frontend || true
}

cat > "$RUNTIME_OVERRIDE" <<EOF
services:
  backend:
    image: $BACKEND_IMAGE
  frontend:
    image: $FRONTEND_IMAGE
EOF

if ! docker compose -f "$BASE_COMPOSE" -f "$LOCAL_OVERRIDE" -f "$RUNTIME_OVERRIDE" \
  up -d --force-recreate --no-deps backend frontend; then
  restore
  exit 1
fi

ready=0
for _ in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Running}}' ticketz_backend 2>/dev/null)" = true ] \
    && [ "$(docker inspect -f '{{.State.Running}}' ticketz_frontend 2>/dev/null)" = true ] \
    && curl -fsS http://127.0.0.1:3000/ >/dev/null; then
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

echo "Release $RELEASE_ID is active. Rollback file: $ROLLBACK_OVERRIDE"
docker compose -f "$BASE_COMPOSE" -f "$LOCAL_OVERRIDE" -f "$RUNTIME_OVERRIDE" ps
