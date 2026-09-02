#!/usr/bin/env bash
set -euo pipefail

# Installs the one-command GHCR updater on a Ticketz-compatible host.
# Run once as root: ./install-ghcr-updater.sh

SOURCE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TARGET_DIR=${TARGET_DIR:-/opt/ticketz}
COMMAND_PATH=${COMMAND_PATH:-/usr/local/sbin/chat-update}

test -f "$TARGET_DIR/docker-compose.yml"
test -f "$TARGET_DIR/docker-compose.override.yml"

install -m 644 "$SOURCE_DIR/docker-compose.ghcr.yml" \
  "$TARGET_DIR/docker-compose.ghcr.yml"
install -m 755 "$SOURCE_DIR/apply-ghcr-release.sh" \
  "$TARGET_DIR/apply-ghcr-release.sh"

cat > "$COMMAND_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/ticketz/apply-ghcr-release.sh "$@"
EOF
chmod 755 "$COMMAND_PATH"

echo "Installed. Update with: sudo chat-update <image-tag>"
