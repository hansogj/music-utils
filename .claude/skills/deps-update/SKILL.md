---
name: deps-update
description: Update dependencies in the music-utils monorepo, verify tests pass, create a PR, and let CI publish after merge. Use when the user says "update deps", "bump dependencies", "update packages", or similar.
---

# deps-update — Dependency Update + PR + Publish

Working directory: `/git/music/music-utils`

This monorepo uses **pnpm workspaces** and **changesets** for versioning. The CI (`release.yml`) auto-publishes to npm when a changeset version PR is merged to main — no manual publish needed.

---

## Step 1 — Check for available updates

Show what's outdated before touching anything:

```bash
cd /git/music/music-utils && npx npm-check-updates --deep -t minor
```

Report the list to the user. If nothing is outdated, tell them and stop.

For major updates the user must explicitly ask (e.g. `/deps-update majors`). In that case use `-t latest` instead of `-t minor` in all commands below.

---

## Step 2 — Ask the user for bump type

Use `AskUserQuestion` to ask which semver bump the changeset should use:

- **patch** — bug fixes only, no API changes
- **minor** — new capabilities, backwards-compatible
- **major** — breaking changes

Default recommendation: **patch** (dependency updates rarely change public API).

---

## Step 3 — Create a branch

```bash
cd /git/music/music-utils && git checkout -b chore/update-deps-$(date +%Y%m%d)
```

---

## Step 4 — Apply updates

Run non-interactively (the `-i` flag in `pnpm run update` requires a TTY):

```bash
cd /git/music/music-utils && npx npm-check-updates -u -t minor --deep && pnpm run post:update
```

For major updates:
```bash
cd /git/music/music-utils && npx npm-check-updates -u -t latest --deep && pnpm run post:update
```

`post:update` removes `node_modules`, prunes, and reinstalls cleanly.

---

## Step 5 — Run tests

```bash
cd /git/music/music-utils && pnpm test
```

If tests fail, stop and report the failure to the user. Do **not** proceed to PR creation.

---

## Step 6 — Create a changeset

Write the changeset file directly (avoid the interactive `pnpm changeset` CLI).

Replace `<bump>` with the type chosen in Step 2 (`patch`, `minor`, or `major`).
Replace `<summary>` with a short one-liner like `"chore: update dependencies to latest minor versions"`.

```bash
cat > /git/music/music-utils/.changeset/update-deps-$(date +%Y%m%d).md << 'EOF'
---
"@hansogj/music-utils": <bump>
"@hansogj/discogs-cover": <bump>
"@hansogj/discogs-item-lookup": <bump>
---

<summary>
EOF
```

---

## Step 7 — Commit and push

```bash
cd /git/music/music-utils && git add -A && git commit -m "chore: update dependencies to latest minor versions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push -u origin HEAD
```

---

## Step 8 — Create the PR

```bash
cd /git/music/music-utils && gh pr create \
  --title "chore: update dependencies" \
  --body "$(cat <<'EOF'
## Summary
- Bump all packages to latest minor versions
- Tests passing

## Publish
CI will automatically open a **chore: version packages** PR once this merges to main. Merging that PR triggers npm publish via OIDC Trusted Publisher.
EOF
)"
```

Return the PR URL to the user.

---

## After merge — what happens automatically

1. `release.yml` runs on push to `main`
2. `changesets/action` detects the new changeset → opens a **"chore: version packages"** PR
3. User merges the version PR → `changesets/action` runs `pnpm run release` → publishes all three packages to npm

No manual publish step needed.
