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

Report the list to the user. Don't stop yet when nothing is outdated: Step 1b may still find something to fix.

For major updates the user must explicitly ask (e.g. `/deps-update majors`). In that case use `-t latest` instead of `-t minor` in all commands below.

---

## Step 1b — Check open Dependabot alerts

List the open alerts (`gh` needs the sandbox off):

```bash
cd /git/music/music-utils && gh api repos/hansogj/music-utils/dependabot/alerts --paginate \
  --jq '.[] | select(.state=="open") | [.number, .security_advisory.severity, .dependency.package.name, .security_vulnerability.vulnerable_version_range, (.security_vulnerability.first_patched_version.identifier // "none"), (.dependency.scope // ""), .security_advisory.summary] | @tsv'
```

For each alert, find what pulls the package in and whether a published package ships it:

```bash
cd /git/music/music-utils && pnpm why <package> -r
```

A package only under `devDependencies` (vite, vitest, eslint, changesets, …) never reaches users; one under a published package's `dependencies` does. Go by `pnpm why`, not the alert's scope column: Dependabot can't tell dev from runtime in `pnpm-lock.yaml` and often says `runtime` for dev tooling.

An advisory whose summary starts with "Withdrawn Advisory" is no longer considered a vulnerability: GitHub usually closes such alerts by itself. Report it; if it stays open, offer to dismiss it (`dismissed_reason=inaccurate`, comment "Advisory withdrawn").

Sort the alerts into:

1. **Fixed by the updates**: a direct dependency, or a transitive one whose parent's new version takes the patched release. Step 3 handles it; check afterwards (Step 3b).
2. **Patched, but nothing pulls the fix in**: add an override to `pnpm-workspace.yaml` under `overrides:`, in the style of the ones there (comment: advisory, affected range, `Via:` chain). Keep the override to the vulnerable major, e.g. `picomatch@4: '^4.0.8'`, so a parent that needs another major isn't forced onto it. If `minimumReleaseAge` rejects the patched version because it's too fresh, don't weaken the policy: report it and leave the alert for the next run.
3. **No patched version yet**: nothing to install. Report it with its exposure (dev-only or shipped) and ask the user with `AskUserQuestion` whether to leave it open or dismiss it. Never dismiss an alert without asking. A dismissal, for a dev-only package whose input is the repo's own code, looks like:

   ```bash
   gh api -X PATCH repos/hansogj/music-utils/dependabot/alerts/<n> \
     -f state=dismissed -f dismissed_reason=tolerable_risk \
     -f dismissed_comment="Dev-only (<via chain>); no patched version yet; input is the repo's own globs/config."
   ```

Report the sorted list to the user together with the outdated list. **Stop here** when nothing is outdated and no alert is in group 1 or 2.

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

`post:update` removes `node_modules`, prunes, and reinstalls cleanly. If Step 1b added overrides, run `pnpm install` once more after editing `pnpm-workspace.yaml`.

Then check `git diff pnpm-workspace.yaml`: pnpm sometimes adds `minimumReleaseAge` exemptions on its own. Remove them and pick a version one release older instead.

### Step 3b — Check the alerts are gone

For each alert from groups 1 and 2 of Step 1b:

```bash
cd /git/music/music-utils && pnpm why <package> -r
```

No version in the vulnerable range may be left. If one is, add or widen an override (Step 1b, group 2) and install again. GitHub closes the alerts by itself once the PR's lockfile reaches `main`.

---

## Step 4 — Run the full suite

```bash
cd /git/music/music-utils && pnpm run precommit
```

This is what the git pre-commit hook runs (tests, coverage thresholds, CI tag tests, lint, format, tsc, builds for every package). If it fails, stop and report the failure to the user. Do **not** proceed to PR creation.

---

## Step 5 — Add a changeset (only if needed)

A changeset is needed only for a published package whose **`dependencies`** (runtime) changed — that changes what users install. Pure `devDependencies` bumps don't need a release; skip this step for them. An override in `pnpm-workspace.yaml` doesn't need one either: it changes only this repo's lockfile, not what users install (to fix a shipped transitive dependency for users, raise the direct dependency's range instead).

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

## Dependabot
<"Fixes #<n> (<package>, <severity>) by …", one line per alert; alerts left open (no patch yet) and why; or "No open alerts.">

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
