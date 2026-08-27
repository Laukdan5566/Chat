#!/usr/bin/env bash
set -euo pipefail

# Downloads a release assembled by VIB. Run on production as user fp.
# Usage: ./fp-pull-vib-release.sh <release-id>

RELEASE_ID=${1:?"release id is required"}
VIB_HOST=${VIB_HOST:-"chat@11.88.88.8"}
VIB_KEY=${VIB_KEY:-"$HOME/.ssh/id_ed25519_vib_release"}
RELEASE_ROOT=${RELEASE_ROOT:-"$HOME/ticketz-releases"}
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
KNOWN_HOSTS=${KNOWN_HOSTS:-"$HOME/.ssh/known_hosts"}

mkdir -p "$RELEASE_DIR"
scp -i "$VIB_KEY" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$KNOWN_HOSTS" \
  "$VIB_HOST:ticketz-releases/$RELEASE_ID/images.tar.gz" \
  "$VIB_HOST:ticketz-releases/$RELEASE_ID/images.tar.gz.sha256" \
  "$VIB_HOST:ticketz-releases/$RELEASE_ID/release.env" \
  "$RELEASE_DIR/"

(cd "$RELEASE_DIR" && sha256sum -c images.tar.gz.sha256)
echo "Release downloaded and verified: $RELEASE_ID"
