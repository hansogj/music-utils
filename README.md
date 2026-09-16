# music-utils monorepo

TypeScript toolkit for managing a personal FLAC/MP3 music collection. Three packages, published independently to npm via OIDC Trusted Publisher:

| Package | Description |
|---------|-------------|
| [`@hansogj/music-utils`](./packages/music-utils) | Top-level CLI suite: CD ripping via `cdparanoia`, tag reading/writing, Discogs metadata lookup, cover art fetching, folder-structure normalization. Depends on the other two. |
| [`@hansogj/discogs-item-lookup`](./packages/discogs-item-lookup) | Standalone client + CLI for fetching release metadata from the Discogs API. |
| [`@hansogj/discogs-cover`](./packages/discogs-cover) | Standalone client + CLI for fetching and downloading album cover art from Discogs. |

The typical end-user only installs `@hansogj/music-utils` (which brings the other two along transitively). The lower-level packages are useful on their own if you just need Discogs lookups or covers without the ripping/tagging pipeline.

## `scripts/audit` — music-audit CLI

A private, unpublished script for auditing and interactively repairing a local music library. Not part of the published npm packages.

### What it checks

| Check | Severity | Description |
|-------|----------|-------------|
| Folder starts with 4-digit year | SEVERE | e.g. `1984 No Return` |
| Correct disc separator (`∕` U+2215) | SEVERE | e.g. `(Disc 1∕2)` |
| Auxiliary info in `[]` not `{}` | SEVERE | |
| Artist under correct `[A-Z]` letter dir | SEVERE | Articles stripped for sorting |
| All required tags present | HIGH | TITLE, ARTIST, ALBUM, DATE, TRACKNUMBER |
| Filename matches TITLE tag | MODERATE | |
| Duplicate track numbers | MODERATE | |

### Usage

```bash
# Audit only (no Discogs lookups)
pnpm --filter @music/audit run audit -- --root /mnt/music --no-discogs

# Audit with Discogs suggestions (top 5 releases, scored against local track names)
pnpm --filter @music/audit run audit -- --root /mnt/music --token YOUR_TOKEN

# Point at a single album folder
music-audit --root /mnt/music/Z/ZAO/1976\ Kawana --token YOUR_TOKEN

# Interactive repair — step through issues album by album
sudo music-audit --repair --root /mnt/music --token YOUR_TOKEN

# Re-tag everything (including albums that already pass) with Discogs enrichment
sudo music-audit --retag --root /mnt/music --token YOUR_TOKEN

# Serve HTML report in browser
music-audit --ui --root /mnt/music --token YOUR_TOKEN
```

`DISCOGS_TOKEN` can also be set as an environment variable instead of `--token`.

### Repair mode

`--repair` (or `--retag`, which implies repair) walks album-by-album through issues and offers automated fixes:

- **Folder renames** — year prefix, disc separator, bracket style, letter-dir moves
- **Discogs tagging** — fetches tracklist, writes TITLE, ARTIST, ALBUM, DATE, TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (Discogs URL), DISCOGS_RELEASE_ID; offers to rename files and folders to match
- **Folder/artist rename** — detects when Discogs artist or album title differs from local folder names
- **Name/tag sync** — rename file to match tag, or update tag to match filename

Release IDs are accepted as plain numbers (`4565937`), `r4565937`, `[r4565937]`, or full Discogs URLs. Each session is logged to `.music-audit-repair.log` (JSON Lines) and previously-fixed issues are auto-skipped on resume.

### Install the `music-audit` binary system-wide

```bash
sudo bash scripts/install-bins.sh
```

## Development

Package manager: **pnpm** (enforced via preinstall hook). Node 25.x via Volta.

```bash
pnpm install
pnpm --filter @hansogj/music-utils run test
pnpm --filter @hansogj/music-utils run precommit
```

Per-package scripts live in each `packages/*/package.json`; the workspace root has a monorepo-wide `precommit` that runs each package's `precommit` sequentially (via `pnpm -r`).

### Bash completion

`@hansogj/music-utils` ships a completion script for all `music-utils-*` commands (flag names, directory/file arguments).

```bash
# Create the completions directory if it doesn't exist yet
mkdir -p ~/.local/share/bash-completion/completions

# Generate and install
music-utils-completion bash > ~/.local/share/bash-completion/completions/music-utils
```

Or source it just for the current session:

```bash
source <(music-utils-completion bash)
```

### Releases

Managed via [Changesets](https://github.com/changesets/changesets). Adding a changeset:

```bash
pnpm changeset          # interactive: pick packages + bump type + write summary
```

The `release` workflow on `main` picks up changesets, opens a "Version Packages" PR that bumps versions and updates `CHANGELOG.md`, and on merge publishes the affected packages to npm.
