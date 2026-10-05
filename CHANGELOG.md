# Changelog


## v2.0.0...main

[compare changes](https://github.com/hansogj/music-utils/compare/v2.0.0...main)

### 🚀 Enhancements

- **mu:** Add audit subcommand — forwards to music-audit binary ([#118](https://github.com/hansogj/music-utils/pull/118))

### 🏡 Chore

- Switch from Volta to nvm, document Node 26 + pnpm setup ([7eac388](https://github.com/hansogj/music-utils/commit/7eac388))
- Ignore .claude/worktrees (Claude Code agent temp dirs) ([4d93000](https://github.com/hansogj/music-utils/commit/4d93000))

### ❤️ Contributors

- Hans Ole Gjerdrum ([@hansogj](https://github.com/hansogj))

## @hansogj/discogs-item-lookup@1.4.0...main

[compare changes](https://github.com/hansogj/music-utils/compare/@hansogj/discogs-item-lookup@1.4.0...main)

### 🚀 Enhancements

- Music-audit — library audit, interactive repair, Discogs enrichment ([#97](https://github.com/hansogj/music-utils/pull/97))
- **audit:** Repair UX overhaul, streaming scan, logging, info.txt, regex fix ([#109](https://github.com/hansogj/music-utils/pull/109))
- **audit:** Publish prep — vitest, tsup build, unit tests, Docker integration test ([#113](https://github.com/hansogj/music-utils/pull/113))
- **music-utils:** ⚠️  Unified CLI — mu + music-utils entry points (v2.0.0) ([#117](https://github.com/hansogj/music-utils/pull/117))

### 🩹 Fixes

- **audit:** Add shebang banner to tsup output so bin entries are valid ([2517326](https://github.com/hansogj/music-utils/commit/2517326))
- **completion:** Use mapfile -t to prevent word-splitting on spaced dir names ([#115](https://github.com/hansogj/music-utils/pull/115))
- **music-utils:** Replace workspace:* deps with real versions for npm publish ([19b88b4](https://github.com/hansogj/music-utils/commit/19b88b4))
- **audit:** Walk artist-level root (--root inside an artist dir) ([f61ef91](https://github.com/hansogj/music-utils/commit/f61ef91))
- **audit:** Move log dir to ~/.local/share/music-audit, add year to timestamp ([b929285](https://github.com/hansogj/music-utils/commit/b929285))
- **release:** Check npm login before doing anything irreversible ([52b5dbd](https://github.com/hansogj/music-utils/commit/52b5dbd))
- **release:** Use --no-git-tag-version, handle commit+tag ourselves ([3c68472](https://github.com/hansogj/music-utils/commit/3c68472))

### 📖 Documentation

- Move music-audit details to scripts/audit/README.md ([#111](https://github.com/hansogj/music-utils/pull/111))
- **CLAUDE.md:** Sync audit behaviours and fix jest→vitest references ([#112](https://github.com/hansogj/music-utils/pull/112))

### 🏡 Chore

- Update vulnerable deps — js-yaml, brace-expansion, vitest, esbuild ([#110](https://github.com/hansogj/music-utils/pull/110))
- Migrate from Volta to nvm + corepack ([48f6526](https://github.com/hansogj/music-utils/commit/48f6526))
- **music-utils:** Bump to 1.6.2 — bash completion mapfile fix ([e77a6fc](https://github.com/hansogj/music-utils/commit/e77a6fc))
- Update Node to 26.10.0 ([ce66b60](https://github.com/hansogj/music-utils/commit/ce66b60))
- Sync pnpm-lock.yaml ([07186a2](https://github.com/hansogj/music-utils/commit/07186a2))
- Add changelogen, generate initial CHANGELOG.md ([ba50064](https://github.com/hansogj/music-utils/commit/ba50064))
- Add release script — changelog + version bump + publish in one command ([e768dcd](https://github.com/hansogj/music-utils/commit/e768dcd))
- Remove duplicate release key and stale changeset scripts ([d656bb2](https://github.com/hansogj/music-utils/commit/d656bb2))
- Update changelog ([ad9fee3](https://github.com/hansogj/music-utils/commit/ad9fee3))
- Update changelog ([7ad633b](https://github.com/hansogj/music-utils/commit/7ad633b))
- **release:** Bump @hansogj/music-utils to 1.6.4 ([e5fd605](https://github.com/hansogj/music-utils/commit/e5fd605))
- Remove changeset release workflow — releases are now manual ([7fb6ee6](https://github.com/hansogj/music-utils/commit/7fb6ee6))
- Version packages ([#116](https://github.com/hansogj/music-utils/pull/116))

#### ⚠️ Breaking Changes

- **music-utils:** ⚠️  Unified CLI — mu + music-utils entry points (v2.0.0) ([#117](https://github.com/hansogj/music-utils/pull/117))

### ❤️ Contributors

- Hans Ole Gjerdrum ([@hansogj](https://github.com/hansogj))

## @hansogj/discogs-item-lookup@1.4.0...main

[compare changes](https://github.com/hansogj/music-utils/compare/@hansogj/discogs-item-lookup@1.4.0...main)

### 🚀 Enhancements

- Music-audit — library audit, interactive repair, Discogs enrichment ([#97](https://github.com/hansogj/music-utils/pull/97))
- **audit:** Repair UX overhaul, streaming scan, logging, info.txt, regex fix ([#109](https://github.com/hansogj/music-utils/pull/109))
- **audit:** Publish prep — vitest, tsup build, unit tests, Docker integration test ([#113](https://github.com/hansogj/music-utils/pull/113))

### 🩹 Fixes

- **audit:** Add shebang banner to tsup output so bin entries are valid ([2517326](https://github.com/hansogj/music-utils/commit/2517326))
- **completion:** Use mapfile -t to prevent word-splitting on spaced dir names ([#115](https://github.com/hansogj/music-utils/pull/115))
- **music-utils:** Replace workspace:* deps with real versions for npm publish ([19b88b4](https://github.com/hansogj/music-utils/commit/19b88b4))
- **audit:** Walk artist-level root (--root inside an artist dir) ([f61ef91](https://github.com/hansogj/music-utils/commit/f61ef91))
- **audit:** Move log dir to ~/.local/share/music-audit, add year to timestamp ([b929285](https://github.com/hansogj/music-utils/commit/b929285))
- **release:** Check npm login before doing anything irreversible ([52b5dbd](https://github.com/hansogj/music-utils/commit/52b5dbd))

### 📖 Documentation

- Move music-audit details to scripts/audit/README.md ([#111](https://github.com/hansogj/music-utils/pull/111))
- **CLAUDE.md:** Sync audit behaviours and fix jest→vitest references ([#112](https://github.com/hansogj/music-utils/pull/112))

### 🏡 Chore

- Update vulnerable deps — js-yaml, brace-expansion, vitest, esbuild ([#110](https://github.com/hansogj/music-utils/pull/110))
- Migrate from Volta to nvm + corepack ([48f6526](https://github.com/hansogj/music-utils/commit/48f6526))
- **music-utils:** Bump to 1.6.2 — bash completion mapfile fix ([e77a6fc](https://github.com/hansogj/music-utils/commit/e77a6fc))
- Update Node to 26.10.0 ([ce66b60](https://github.com/hansogj/music-utils/commit/ce66b60))
- Sync pnpm-lock.yaml ([07186a2](https://github.com/hansogj/music-utils/commit/07186a2))
- Add changelogen, generate initial CHANGELOG.md ([ba50064](https://github.com/hansogj/music-utils/commit/ba50064))
- Add release script — changelog + version bump + publish in one command ([e768dcd](https://github.com/hansogj/music-utils/commit/e768dcd))
- Remove duplicate release key and stale changeset scripts ([d656bb2](https://github.com/hansogj/music-utils/commit/d656bb2))
- Update changelog ([ad9fee3](https://github.com/hansogj/music-utils/commit/ad9fee3))

### ❤️ Contributors

- Hans Ole Gjerdrum ([@hansogj](https://github.com/hansogj))

## @hansogj/discogs-item-lookup@1.4.0...main

[compare changes](https://github.com/hansogj/music-utils/compare/@hansogj/discogs-item-lookup@1.4.0...main)

### 🚀 Enhancements

- Music-audit — library audit, interactive repair, Discogs enrichment ([#97](https://github.com/hansogj/music-utils/pull/97))
- **audit:** Repair UX overhaul, streaming scan, logging, info.txt, regex fix ([#109](https://github.com/hansogj/music-utils/pull/109))
- **audit:** Publish prep — vitest, tsup build, unit tests, Docker integration test ([#113](https://github.com/hansogj/music-utils/pull/113))

### 🩹 Fixes

- **audit:** Add shebang banner to tsup output so bin entries are valid ([2517326](https://github.com/hansogj/music-utils/commit/2517326))
- **completion:** Use mapfile -t to prevent word-splitting on spaced dir names ([#115](https://github.com/hansogj/music-utils/pull/115))
- **music-utils:** Replace workspace:* deps with real versions for npm publish ([19b88b4](https://github.com/hansogj/music-utils/commit/19b88b4))
- **audit:** Walk artist-level root (--root inside an artist dir) ([f61ef91](https://github.com/hansogj/music-utils/commit/f61ef91))
- **audit:** Move log dir to ~/.local/share/music-audit, add year to timestamp ([b929285](https://github.com/hansogj/music-utils/commit/b929285))

### 📖 Documentation

- Move music-audit details to scripts/audit/README.md ([#111](https://github.com/hansogj/music-utils/pull/111))
- **CLAUDE.md:** Sync audit behaviours and fix jest→vitest references ([#112](https://github.com/hansogj/music-utils/pull/112))

### 🏡 Chore

- Update vulnerable deps — js-yaml, brace-expansion, vitest, esbuild ([#110](https://github.com/hansogj/music-utils/pull/110))
- Migrate from Volta to nvm + corepack ([48f6526](https://github.com/hansogj/music-utils/commit/48f6526))
- **music-utils:** Bump to 1.6.2 — bash completion mapfile fix ([e77a6fc](https://github.com/hansogj/music-utils/commit/e77a6fc))
- Update Node to 26.10.0 ([ce66b60](https://github.com/hansogj/music-utils/commit/ce66b60))
- Sync pnpm-lock.yaml ([07186a2](https://github.com/hansogj/music-utils/commit/07186a2))
- Add changelogen, generate initial CHANGELOG.md ([ba50064](https://github.com/hansogj/music-utils/commit/ba50064))
- Add release script — changelog + version bump + publish in one command ([e768dcd](https://github.com/hansogj/music-utils/commit/e768dcd))
- Remove duplicate release key and stale changeset scripts ([d656bb2](https://github.com/hansogj/music-utils/commit/d656bb2))

### ❤️ Contributors

- Hans Ole Gjerdrum ([@hansogj](https://github.com/hansogj))

## @hansogj/discogs-item-lookup@1.4.0...main

[compare changes](https://github.com/hansogj/music-utils/compare/@hansogj/discogs-item-lookup@1.4.0...main)

### 🚀 Enhancements

- Music-audit — library audit, interactive repair, Discogs enrichment ([#97](https://github.com/hansogj/music-utils/pull/97))
- **audit:** Repair UX overhaul, streaming scan, logging, info.txt, regex fix ([#109](https://github.com/hansogj/music-utils/pull/109))
- **audit:** Publish prep — vitest, tsup build, unit tests, Docker integration test ([#113](https://github.com/hansogj/music-utils/pull/113))

### 🩹 Fixes

- **audit:** Add shebang banner to tsup output so bin entries are valid ([2517326](https://github.com/hansogj/music-utils/commit/2517326))
- **completion:** Use mapfile -t to prevent word-splitting on spaced dir names ([#115](https://github.com/hansogj/music-utils/pull/115))
- **music-utils:** Replace workspace:* deps with real versions for npm publish ([19b88b4](https://github.com/hansogj/music-utils/commit/19b88b4))
- **audit:** Walk artist-level root (--root inside an artist dir) ([f61ef91](https://github.com/hansogj/music-utils/commit/f61ef91))
- **audit:** Move log dir to ~/.local/share/music-audit, add year to timestamp ([b929285](https://github.com/hansogj/music-utils/commit/b929285))

### 📖 Documentation

- Move music-audit details to scripts/audit/README.md ([#111](https://github.com/hansogj/music-utils/pull/111))
- **CLAUDE.md:** Sync audit behaviours and fix jest→vitest references ([#112](https://github.com/hansogj/music-utils/pull/112))

### 🏡 Chore

- Update vulnerable deps — js-yaml, brace-expansion, vitest, esbuild ([#110](https://github.com/hansogj/music-utils/pull/110))
- Migrate from Volta to nvm + corepack ([48f6526](https://github.com/hansogj/music-utils/commit/48f6526))
- **music-utils:** Bump to 1.6.2 — bash completion mapfile fix ([e77a6fc](https://github.com/hansogj/music-utils/commit/e77a6fc))
- Update Node to 26.10.0 ([ce66b60](https://github.com/hansogj/music-utils/commit/ce66b60))
- Sync pnpm-lock.yaml ([07186a2](https://github.com/hansogj/music-utils/commit/07186a2))

### ❤️ Contributors

- Hans Ole Gjerdrum ([@hansogj](https://github.com/hansogj))

