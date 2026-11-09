---
name: deps-update
description: Update dependencies in the music-utils monorepo, verify tests pass, add a changeset where needed, and create a PR. Use when the user says "update deps", "bump dependencies", "update packages", or similar.
---

# deps-update — Dependency Update + PR

Working directory: `/git/music/music-utils`

This monorepo uses **pnpm workspaces** and **changesets** for versioning. There is **no CI publishing**: `.github/workflows/build.yml` only builds and tests. Releases are cut manually afterwards (see "After merge").

Published packages: `@hansogj/music-utils`, `@hansogj/discogs-item-lookup`, `@hansogj/discogs-cover`.
`scripts/audit` (`@hansogj/music-audit`) is `"private": true` — never add it to a changeset.

pnpm 12 notes:
- Overrides live in `pnpm-workspace.yaml` (`overrides:`), not in the root `package.json`.
- The supply-chain `minimumReleaseAge` policy rejects very fresh versions. If install refuses one, pick an older version rather than weakening the policy.

---

## Step 1 — Check for available updates

Show what's outdated before touching anything:

```bash
cd /git/music/music-utils && npx npm-check-updates --deep -t minor
```

Report the list to the user. If nothing is outdated, tell them and stop.

For major updates the user must explicitly ask (e.g. `/deps-update majors`). In that case use `-t latest` instead of `-t minor` in all commands below.

---

## Step 2 — Create a branch

```bash
cd /git/music/music-utils && git checkout main && git pull --ff-only && git checkout -b chore/update-deps-$(date +%Y%m%d)
```

---

## Step 3 — Apply updates

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

## Step 4 — Run the full suite

```bash
cd /git/music/music-utils && pnpm run precommit
```

This is what the git pre-commit hook runs (tests, coverage thresholds, CI tag tests, lint, format, tsc, builds for every package). If it fails, stop and report the failure to the user. Do **not** proceed to PR creation.

---

## Step 5 — Add a changeset (only if needed)

A changeset is needed only for a published package whose **`dependencies`** (runtime) changed — that changes what users install. Pure `devDependencies` bumps don't need a release; skip this step for them.

Ask the user for the bump type with `AskUserQuestion` (default **patch** — dependency updates rarely change public API). Write the file directly (avoid the interactive `pnpm changeset` CLI), listing only the affected published packages:

```bash
cat > /git/music/music-utils/.changeset/update-deps-$(date +%Y%m%d).md << 'EOF'
---
"@hansogj/music-utils": patch
---

Update dependencies.
EOF
```

---

## Step 6 — Commit and push

Stage files by name — never `git add -A` / `git add .` (the sandbox can show placeholder files such as `.bashrc` or `.mcp.json` in the repo root):

```bash
cd /git/music/music-utils && git add pnpm-lock.yaml pnpm-workspace.yaml package.json packages/*/package.json scripts/*/package.json .changeset/*.md && git status --short
git commit -m "chore(deps): update dependencies to latest minor versions"
git push -u origin HEAD
```

End the commit message with the co-author line from the current session's attribution instructions. Commits are SSH-signed and the pre-commit hook runs the full suite, so the commit may need to run outside the sandbox.

---

## Step 7 — Create the PR

```bash
cd /git/music/music-utils && gh pr create --base main \
  --title "chore(deps): update dependencies" \
  --body "$(cat <<'EOF'
## Summary
- Bump dependencies to latest minor versions
- Full precommit suite passing

## Release
<"Changeset included for …" or "Dev dependencies only — no release needed.">
EOF
)"
```

If `gh pr edit` fails with a Projects-classic GraphQL error, edit via `gh api -X PATCH repos/hansogj/music-utils/pulls/<n> -F body=@file`.

Return the PR URL to the user.

---

## After merge — releasing (manual, only when the user asks)

1. On a branch from up-to-date `main`: `pnpm version-packages` (bumps versions, writes each package's `CHANGELOG.md`, consumes changesets, refreshes the lockfile). Commit, open a "chore: version packages" PR, merge.
2. Remind the user to run `npm login` first (sessions expire quickly; a 404 on publish means not logged in).
3. From `main`: `pnpm release` — checks npm login, builds, `changeset publish`. Needs 2FA, so the user runs it themselves, e.g. `! pnpm release --otp=<code>`.
4. Push the new tags: `git push origin --tags` (changesets creates lightweight tags, which `--follow-tags` skips).
