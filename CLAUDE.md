# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI toolkit for managing FLAC and MP3 music collections. Handles tag reading/writing, CD ripping, Discogs metadata lookup, cover art fetching, and folder structure normalization. Relies on external CLI tools: `metaflac`, `id3v2`, `cdparanoia`, `flac`, `ffprobe`, `file`.

## Commands

**Package manager**: pnpm (enforced via preinstall hook). Node 25.x via Volta.

```bash
pnpm run build              # Clean + compile TypeScript with declarations
pnpm run vitest             # Run tests (default reporter)
pnpm run vitest:watch       # Run tests in watch mode
pnpm run vitest:ci          # Run tests with coverage thresholds
pnpm test                   # Full suite: vitest + vitest:ci + CI integration tests
pnpm run lint               # ESLint
pnpm run format:check       # Prettier check
pnpm run format:lint:fix    # Fix both lint and format issues
pnpm run precommit          # Full pre-commit chain: test + lint + format:check + tsc + build
```

Test data is synced from `test-data/raw/` to `test-data/copy/` before tests (via `pretest`). CI integration tests in `ci/` run real tag operations against copied test files.

## Architecture

### Core data model (`src/types.ts`)

`Release` (artist, album, year, disc info) -> `Track` (extends Release with trackName, trackNo) -> `File` (track + path + fileType).

### Tag pipeline (`src/tag/`)

1. **Extract** (`tag.ts:extractTags`): detects file type via `file -i`, dispatches to `flac.ts` or `mp3.ts` readers, falls back to path-based extraction (`fromPath.ts`)
2. **Write** (`tag.ts:tagFile`): dispatches to format-specific writers that shell out to `metaflac`/`id3v2`

### Album metadata (`src/album/`)

- `parse.path.ts`: Parses artist/album/year/disc info from directory structure convention: `Artist/YYYY Album Title (Disc N∕M) [aux info]/`
- `merge-meta.ts`: Merges extracted tags with user-provided or Discogs metadata

### Key conventions

- The `∕` character (DISC_NO_SPLIT, not a regular slash) separates disc number from total in folder names
- Definite articles ("the", "los", "il", etc.) are moved to suffix position for artist sorting: "The Beatles" -> "Beatles, The"
- `@hansogj/array.utils` provides `.defined()` (filter nullish) and `.onEmpty()` chainable array methods used extensively throughout
- `@hansogj/maybe` provides Maybe/Optional monad used for null-safe value access
- Shell commands are executed via `src/utils/execute.ts`: `executeFile` (using `child_process.execFile`, preferred for safety) and `execute` (using `child_process.exec`, for shell-dependent commands)

### Module layout

- `src/run/` - Entry point scripts (excluded from build and test coverage). These orchestrate the CLI workflows.
- `src/utils/` - Cross-cutting: shell execution, path ops, CLI arg parsing, colored logging, prompts
- `src/similarities/` - Fuzzy artist name matching
- `src/covers/` - Discogs cover art fetching

### Testing

- Vitest with ts-jest, tests colocated with source (`*.test.ts`)
- Coverage thresholds: 50% statements, 80% branches, 90% functions, 90% lines
- Mocks in `__mocks__/` subdirectories; `execute`, `path`, and tag reader modules are commonly mocked
- `src/run/`, `prompt.ts`, `color.log.ts`, `photo.ts` are excluded from coverage

### TypeScript config

- Strict mode with `strictNullChecks: true`
- ESNext target, Node16 module resolution
- `tsconfig.build.json` excludes tests and mocks; `tsconfig.ci.json` is used for CI integration test compilation

## `scripts/audit/` — music-audit

Private, unpublished audit + repair CLI. Run with `pnpm --filter @music/audit run audit -- [options]` or via the installed `music-audit` binary.

### Architecture

```
scripts/audit/src/
  audit.ts        — CLI entry: arg parsing, walk → audit → report/repair/ui/json
  walk.ts         — walkLibrary(): detects letter-layer, artist, album structure;
                    also handles --root pointing directly at an album folder
  tags.ts         — readFlacTags() / readMp3Tags() via metaflac / id3v2 -l
  discogs.ts      — searchDiscogs(), fetchRelease(); all HTTP through discogsGet()
                    which retries 429/500 with exponential backoff
  similarity.ts   — scoreTracklist(): fuzzy match local track names vs Discogs
  repair.ts       — runRepair(); AuditStream (background scan queue); BackSignal
                    (Esc → back to action menu); buildDiscogsAction(); interactive
                    issue loop
  report.ts       — printReport(); terminal-formatted severity sections
  server.ts       — serveReport(): HTML UI mode (--ui flag)
  logger.ts       — AuditLogger: JSON Lines session/album/summary events (--log)
  info-txt.ts     — writeInfoTxt() (Discogs-rich); writeInfoTxtFromTags() (fallback)
  checks/
    folder.ts     — WRONG_LETTER_DIR, MISSING_YEAR_PREFIX, WRONG_DISC_SEPARATOR,
                    WRONG_AUX_BRACKETS
    tags.ts       — NO_TAGS, MISSING_TAGS, TAG_READ_ERROR
    names.ts      — NAME_TAG_MISMATCH; parseNameFromFilename()
    duplicates.ts — DUPLICATE_TRACKS
```

### Key behaviours

- **Discogs scoring**: fetches tracklists for up to 3 candidates in parallel, ranks by fuzzy title similarity (`scoreTracklist`)
- **Streaming repair**: `AuditStream` producer/consumer queue — scan runs in background while user handles already-found albums interactively
- **Repair log**: JSON Lines at `.audit-log/MM.dd.HH.mm-repair.log`; each event written immediately (crash-safe). Log is audit history only — issues are always shown if audit detects them (no auto-skip on resume)
- **Audit log**: `--log` flag writes session/album/summary events to `.audit-log/MM.dd.HH.mm-audit.log`
- **Tag writes**: FLAC via `metaflac`, MP3 via `id3v2`. Both include post-write verification (TRACKNUMBER/DATE checked before TITLE) to catch silent NFS/CIFS write failures. Fields written from Discogs: TITLE, ARTIST, ALBUMARTIST, ALBUM, DATE, TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (release URL), DISCOGS_RELEASE_ID
- **info.txt**: written after Discogs tagging (rich: tracklist, personnel, durations); silently created from existing tags on audit if none exists
- **File renames**: after Discogs tagging, preview + apply renames to `NN - Title.ext` (or `dDtNN - Title.ext` for multi-disc) to prevent NAME_TAG_MISMATCH on next audit run
- **`--retag`**: implies `--repair`; visits all albums including those that already pass, offering Discogs enrichment
- **Release ID parsing**: accepts `4565937`, `r4565937`, `[r4565937]`, full Discogs release URLs. Master IDs (`m<n>`) are rejected with a clear message
- **Folder rename safety**: all renames go through `guardedRename()` which checks for pre-existing target before calling `fs.rename`
- **UX**: Enter defaults to action `[1]`; Esc in release picker throws `BackSignal` → returns to action menu; Enter in release ID prompt uses suggested ID; `b` opens browse list

### Code style

- Prettier: 120 char width, single quotes, trailing commas
- ESLint flat config with TypeScript, Prettier, and import sort plugins
- Functional style with method chaining preferred over imperative loops
