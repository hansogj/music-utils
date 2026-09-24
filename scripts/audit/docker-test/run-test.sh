#!/usr/bin/env bash
set -euo pipefail

# Build the audit package
cd /app

# Install pnpm if not available, then install deps
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm --quiet
fi

# Install dependencies (no frozen lockfile since this is CI-like env)
pnpm install --no-frozen-lockfile --ignore-scripts 2>/dev/null || npm install --legacy-peer-deps --quiet

# Build with tsup
npx tsup 2>&1

echo "Build complete."

# Set up fixture library
bash /app/docker-test/fixture-setup.sh

# Run audit in --json mode against the fixture library
node /app/dist/music-audit.js --root=/tmp/music-lib --no-discogs --json > /tmp/audit-result.json 2>/tmp/audit-stderr.txt || true

echo "Audit stderr:"
cat /tmp/audit-stderr.txt

# Verify all 9 incident codes are present
node /app/docker-test/verify-incidents.mjs
