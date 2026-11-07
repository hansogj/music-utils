# music-utils monorepo

TypeScript toolkit for managing a personal FLAC/MP3 music collection. Three packages, published independently to npm via OIDC Trusted Publisher:

| Package | Description |
|---------|-------------|
| [`@hansogj/music-utils`](./packages/music-utils) | Top-level CLI suite: CD ripping via `cdparanoia`, tag reading/writing, Discogs metadata lookup, cover art fetching, folder-structure normalization. Depends on the other two. |
| [`@hansogj/discogs-item-lookup`](./packages/discogs-item-lookup) | Standalone client + CLI for fetching release metadata from the Discogs API. |
| [`@hansogj/discogs-cover`](./packages/discogs-cover) | Standalone client + CLI for fetching and downloading album cover art from Discogs. |

The typical end-user only installs `@hansogj/music-utils` (which brings the other two along transitively). The lower-level packages are useful on their own if you just need Discogs lookups or covers without the ripping/tagging pipeline.

## `scripts/audit` — music-audit CLI

Private, unpublished tool for auditing and interactively repairing a local music library. See [`scripts/audit/README.md`](./scripts/audit/README.md) for full usage, flags, and repair mode docs.

```bash
sudo bash scripts/install-bins.sh   # install music-audit binary system-wide
```

## Development

Package manager: **pnpm** (enforced via preinstall hook). Node 26.x via nvm — run `nvm use` if your node version is wrong (`.nvmrc` is present).

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

Releases are done manually via `scripts/release.sh`:

```bash
pnpm run release          # patch bump (default)
pnpm run release:minor    # minor bump
pnpm run release:major    # major bump
```

The script verifies npm login, updates `CHANGELOG.md`, bumps `packages/music-utils/package.json`, commits, tags, publishes to npm, and pushes with tags.
