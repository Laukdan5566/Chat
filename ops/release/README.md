# Ticketz release via VIB

VIB is the release builder and artifact source. Production never receives a
source tree or edits files inside containers. It pulls a versioned image archive,
verifies its checksum, and recreates only `backend` and `frontend` with a
user-owned compose override at `/home/fp/ticketz-release`.

## One-time setup

Authorize production's release public key for the `chat` account on VIB. Store
the VIB host key in `/home/fp/.ssh/known_hosts` before using the pull script.

## Release flow

1. Upload the approved source archive to VIB and extract it outside the running
   VIB deployment.
2. On VIB, run `vib-build-release.sh <source-dir> <release-id>`.
3. On production, run `fp-pull-vib-release.sh <release-id>`.
4. On production, run `fp-apply-release.sh <release-id>`.

`fp-apply-release.sh` writes the chosen tags to a third compose override, so a
future recreation using the same three compose files keeps the approved image.
It also writes a timestamped rollback override before changing containers.
