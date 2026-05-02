# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI toolkit for managing FLAC and MP3 music collections. Handles tag reading/writing, CD ripping, Discogs metadata lookup, cover art fetching, and folder structure normalization. Relies on external CLI tools: `metaflac`, `id3v2`, `cdparanoia`, `flac`, `ffprobe`, `file`.

## Commands

**Package manager**: pnpm (enforced via preinstall hook). Node 25.x via Volta.

```bash
pnpm run build              # Clean + compile TypeScript with declarations
pnpm run jest               # Run tests (default reporter)
pnpm run jest:watch         # Run tests in watch mode
pnpm run jest:ci            # Run tests with coverage thresholds
pnpm test                   # Full suite: jest + jest:ci + CI integration tests
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

- Jest with ts-jest, tests colocated with source (`*.test.ts`)
- Coverage thresholds: 50% statements, 80% branches, 90% functions, 90% lines
- Mocks in `__mocks__/` subdirectories; `execute`, `path`, and tag reader modules are commonly mocked
- `src/run/`, `prompt.ts`, `color.log.ts`, `photo.ts` are excluded from coverage

### TypeScript config

- Strict mode with `strictNullChecks: true`
- ESNext target, Node16 module resolution
- `tsconfig.build.json` excludes tests and mocks; `tsconfig.ci.json` is used for CI integration test compilation

### Code style

- Prettier: 120 char width, single quotes, trailing commas
- ESLint flat config with TypeScript, Prettier, and import sort plugins
- Functional style with method chaining preferred over imperative loops
