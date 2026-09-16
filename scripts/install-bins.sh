#!/usr/bin/env bash
# Install symlinks for all scripts/*/bin/* executables into /usr/local/bin.
# Run with sudo: sudo scripts/install-bins.sh

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-/usr/local/bin}"

if [[ $EUID -ne 0 ]]; then
  echo "Re-running with sudo..." >&2
  exec sudo "$0" "$@"
fi

shopt -s nullglob
installed=0

for bin in "$SCRIPTS_DIR"/*/bin/*; do
  [[ -x "$bin" ]] || continue
  name="$(basename "$bin")"
  dest="$TARGET_DIR/$name"
  ln -sf "$bin" "$dest"
  echo "  linked $dest → $bin"
  (( installed++ )) || true
done

if (( installed == 0 )); then
  echo "No executables found under $SCRIPTS_DIR/*/bin/" >&2
  exit 1
fi

echo "Done — $installed symlink(s) installed in $TARGET_DIR"
