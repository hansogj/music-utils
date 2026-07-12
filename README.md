# music-utils monorepo

TypeScript toolkit for managing a personal FLAC/MP3 music collection. Three packages, published independently to npm:

| Package | Description |
|---------|-------------|
| [`@hansogj/music-utils`](./packages/music-utils) | Top-level CLI suite: CD ripping via `cdparanoia`, tag reading/writing, Discogs metadata lookup, cover art fetching, folder-structure normalization. Depends on the other two. |
| [`@hansogj/discogs-item-lookup`](./packages/discogs-item-lookup) | Standalone client + CLI for fetching release metadata from the Discogs API. |
| [`@hansogj/discogs-cover`](./packages/discogs-cover) | Standalone client + CLI for fetching and downloading album cover art from Discogs. |

The typical end-user only installs `@hansogj/music-utils` (which brings the other two along transitively). The lower-level packages are useful on their own if you just need Discogs lookups or covers without the ripping/tagging pipeline.

## Development

Package manager: **pnpm** (enforced via preinstall hook). Node 25.x via Volta.

```bash
pnpm install
pnpm --filter @hansogj/music-utils run test
pnpm --filter @hansogj/music-utils run precommit
```

Per-package scripts live in each `packages/*/package.json`; the workspace root has a monorepo-wide `precommit` that runs each package's `precommit` sequentially (via `pnpm -r`).

### Releases

Managed via [Changesets](https://github.com/changesets/changesets). Adding a changeset:

```bash
pnpm changeset          # interactive: pick packages + bump type + write summary
```

The `release` workflow on `main` picks up changesets, opens a "Version Packages" PR that bumps versions and updates `CHANGELOG.md`, and on merge publishes the affected packages to npm.
