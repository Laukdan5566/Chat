#!/usr/bin/env bash
set -euo pipefail

# Builds a pair of immutable Ticketz images and exports them for production.
# Run on VIB: ./vib-build-release.sh <source-dir> <release-id>

SOURCE_DIR=${1:?"source directory is required"}
RELEASE_ID=${2:?"release id is required"}
RELEASE_ROOT=${RELEASE_ROOT:-"$HOME/ticketz-releases"}
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
FRONTEND_IMAGE="fp-ticketz-frontend:$RELEASE_ID"
BACKEND_IMAGE="fp-ticketz-backend:$RELEASE_ID"

test -d "$SOURCE_DIR/frontend"
test -d "$SOURCE_DIR/backend"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]
mkdir -p "$RELEASE_DIR"

docker build --pull=false -t "$BACKEND_IMAGE" "$SOURCE_DIR/backend"
docker build --pull=false -t "$FRONTEND_IMAGE" "$SOURCE_DIR/frontend"

docker save "$BACKEND_IMAGE" "$FRONTEND_IMAGE" | gzip -1 > "$RELEASE_DIR/images.tar.gz"
sha256sum "$RELEASE_DIR/images.tar.gz" > "$RELEASE_DIR/images.tar.gz.sha256"

cat > "$RELEASE_DIR/release.env" <<EOF
RELEASE_ID=$RELEASE_ID
SERVICES=backend,frontend
BACKEND_IMAGE=$BACKEND_IMAGE
FRONTEND_IMAGE=$FRONTEND_IMAGE
CREATED_AT=$(date --iso-8601=seconds)
EOF

echo "Release ready: $RELEASE_DIR"
cat "$RELEASE_DIR/release.env"
