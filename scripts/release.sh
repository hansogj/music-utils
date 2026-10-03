#!/usr/bin/env bash
set -euo pipefail

BUMP=${1:-patch}  # patch | minor | major

if [[ ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: pnpm run release [patch|minor|major]"
  exit 1
fi

# Verify npm login before doing anything irreversible
if ! npm whoami --registry https://registry.npmjs.org 2>/dev/null; then
  echo "Not logged in to npm. Run: npm login"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

echo "→ Updating CHANGELOG.md..."
pnpm run changelog

if ! git diff --quiet CHANGELOG.md; then
  git add CHANGELOG.md
  git commit -m "chore: update changelog"
fi

echo "→ Bumping $BUMP version and publishing @hansogj/music-utils..."
cd packages/music-utils
npm version "$BUMP"
npm publish

cd ../..
git push --follow-tags

echo "✓ Released $(node -p "require('./packages/music-utils/package.json').version")"
