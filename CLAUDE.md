# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI toolkit for managing FLAC and MP3 music collections. Handles tag reading/writing, CD ripping, Discogs metadata lookup, cover art fetching, and folder structure normalization. Relies on external CLI tools: `metaflac`, `id3v2`, `cdparanoia`, `flac`, `ffprobe`, `file`.

## Commands

**Package manager**: pnpm. Node 26.x via nvm; run nvm use to switch to the version in .nvmrc. pnpm is not installed by hand: nvm installs it automatically into each Node version from ~/.nvm/default-packages (maintained in the dotfiles repo). If pnpm is missing after nvm use, that Node version was installed before the list existed; run npm i -g pnpm once, or reinstall that version with nvm install. Don't use corepack, and don't install tooling with pnpm add -g.

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

**Releases**: Changesets only (root README, "Releases"). Add a `.changeset/*.md` with each user-facing change to a published package; `pnpm version-packages` on a branch, then `pnpm release` from `main`. `scripts/audit` is `"private": true` and never published.

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
- Definite articles ("the", "los", "il", etc.) can be moved to suffix position for artist sorting ("The Beatles" -> "Beatles, The"); off by default, enabled with `artist.sortArticles: true` in config
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

Private, unpublished audit + repair CLI. Run with `pnpm --filter @hansogj/music-audit run audit -- [options]` or via the installed `music-audit` binary. The binary (`scripts/audit/bin/music-audit`, linked by `scripts/install-bins.sh`) runs `src/audit.ts` from this checkout through tsx: the checked-out branch is what runs, with no build or publish step. User docs, including the prompt keys: `scripts/audit/README.md`.

### Architecture

```
scripts/audit/src/
  audit.ts        — CLI entry: arg parsing, walk → audit → report/repair/ui/json
  audit-album.ts  — auditAlbum(): read one album's tracks and run all checks; also the
                    re-scan repair runs after each fix (search: false)
  tag-write.ts    — writeTags(): metaflac / id3v2 writes with post-write verification
  id3-frames.ts   — writeUserFrames(): MP3 TXXX + COMM frames, which id3v2 0.1.12 can't
                    write (one TXXX per file; comments split at ':'); every other frame
                    is copied byte for byte
  walk.ts         — walkLibrary(): crawls up to 10 levels below --root; a folder with
                    tracks is an album, its parent the artist, the one above a letter
                    or group dir (e.g. country). --root may be an album, artist or above
  tags.ts         — readFlacTags() / readMp3Tags() via metaflac / id3v2 -l
  discogs.ts      — searchDiscogs() (+ matchScore(), per disc for a disc folder),
                    fetchRelease(), fetchMaster(), fetchOriginalYear(), parseDiscogsRef(),
                    resolveReleaseId(), pickMasterVersion() (master → CD version for a disc
                    folder), flattenTracklist() (index entries → one track),
                    numberTracklist(); all HTTP through discogsGet(), which waits on
                    the shared rate limiter and retries 429/500; releases cached per session
  similarity.ts   — scoreTracklist(): fuzzy match local track names vs Discogs
  rate-limit.ts   — RateLimiter: moving 60s window sized from X-Discogs-Ratelimit headers
                    (60/min with a token, 25 without), one shared pause on 429;
                    interactive() gives repair-prompt requests slots the scan can't use
  repair.ts       — runRepair() → repairAlbum() per album; AuditStream (background scan
                    queue); repairActions() (per issue code); discogsActionFor() /
                    buildDiscogsAction() (release prompt, chooseDiscSlice(), tag write,
                    info.txt, file renames, folder rename plan); BackSignal (Esc → action
                    menu); RestartSignal (o → album start); setPrompt() for tests
  rename-plan.ts  — sanitizeFilename() ("/" and ":" → " - "), pairWithRelease() (by disc/no,
                    else by order: one folder of a 2-CD release), pairingProblem() (asks
                    before tagging when titles repeat), checkRenames() (no renames that clash),
                    planPairing() (an unnumbered file is placed by title, or is an extra copy)
  report.ts       — printReport(); terminal-formatted severity sections
  server.ts       — serveReport(): HTML UI mode (--ui flag)
  logger.ts       — AuditLogger: JSON Lines session/album/summary events (--log)
  info-txt.ts     — writeInfoTxt() (Discogs-rich); writeInfoTxtFromTags() (fallback); both skip
                    the write when the text is unchanged; appendChangeset() (dated lines under
                    a Changeset header at the bottom, kept across rewrites)
  year-bracket.ts — oldYearBracket() (l → live YYYY, r → rec. YYYY: appended), customAux()
                    (c: the folder's brackets, pre-filled via ask(q, prefill), edited and
                    replacing them), applyOldYear(), albumSetKey() (one answer per disc set)
  disc-split.ts   — sliceForDisc(): the part of a Discogs release one "(Disc n∕m)" folder
                    holds (release disc numbers, else a window placed by the other disc
                    folders' track counts and title match); discOfFolder()
  disc-siblings.ts — siblingDiscs(): the album's other disc folders (track counts, release
                    ID from info.txt/tags) → expected start, suggested release
  checks/
    folder.ts     — WRONG_LETTER_DIR, MISSING_YEAR_PREFIX, WRONG_DISC_SEPARATOR,
                    WRONG_AUX_BRACKETS
    tags.ts       — NO_TAGS, MISSING_TAGS, TAG_READ_ERROR
    names.ts      — NAME_TAG_MISMATCH; parseTrackNames() (per album: "_" → space, drops
                    leading " - " parts only when every track has them, then the track
                    number), localNumbering() (by order when numbers are missing/shared),
                    matchNames() (local titles for Discogs scoring)
    duplicates.ts — DUPLICATE_TRACKS: whole titles, qualifier included; likelyExtras()
    discogs-ids.ts — MISSING_RELEASE_ID: mp3 with a master ID but no release ID (lost by
                    the 81963c0/43bd432 writer); repair restores it from the comment URL
                    or info.txt, or retags from a chosen release
    year.ts       — YEAR_NOT_ORIGINAL (opt-in: --check-years or MUSIC_AUDIT_CHECK_YEARS=true
                    in the shared .env; needs Discogs + DISCOGS_RELEASE_ID tag)
```

### Key behaviours

- **Discogs scoring**: fetches tracklists for up to 3 candidates in parallel, ranks by fuzzy title similarity (`scoreTracklist`)
- **Discogs rate limit**: every request waits for a slot in `discogsLimiter` (rate-limit.ts), so the background scan stays under the limit instead of retrying 429s; a 429 that still happens (same token used elsewhere) pauses all requests 5→10→20→40→60s, up to 8 attempts. The Discogs action in repair runs inside `interactive()`
- **Streaming repair**: `AuditStream` producer/consumer queue — scan runs in background while user handles already-found albums interactively
- **Per-album repair** (`repairAlbum()`): after every fix the album is re-scanned from disk (no new Discogs search), so issues a Discogs retag solved or changed are never shown out of date. A folder rename the user agrees to is stored and applied last, after all file-level fixes for that album, so nothing points at the old path. Answering `o` at any prompt throws `RestartSignal`: the album starts over from its opening table (re-scan, pending folder rename dropped, written changes kept). Tests answer prompts through `setPrompt()`
- **Repair log**: JSON Lines at `~/.local/share/music-audit/YYYY.MM.dd.HH.mm-repair.log`; each event written immediately (crash-safe). Log is audit history only — issues are always shown if audit detects them (no auto-skip on resume)
- **Audit log**: `--log` flag writes session/album/summary events to `~/.local/share/music-audit/YYYY.MM.dd.HH.mm-audit.log` (or `--log=<path>`)
- **Report mode is read-only**: without `--repair`/`--retag` nothing in the library is written
- **Tag writes**: FLAC via `metaflac`, MP3 via `id3v2` for standard frames and `id3-frames.ts` for TXXX (Discogs IDs) and COMM (empty description, full URL). Both include post-write verification (TRACKNUMBER/DATE checked before TITLE) to catch silent NFS/CIFS write failures. Fields written from Discogs: TITLE, ARTIST, ALBUMARTIST, ALBUM, DATE, ORIGINALDATE (MP3: TORY), TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (release URL), DISCOGS_RELEASE_ID and DISCOGS_MASTER_ID (MP3: TXXX with description; JSON report: `tags.discogsReleaseId` / `tags.discogsMasterId`)
- **Original year & title**: DATE, ORIGINALDATE, ALBUM and the folder's year/title always use the Discogs **master** (falling back to the release), never a reissue's year or title. Tracks are matched by numeric position when all positions are numeric, else by listing order (`numberTracklist()`, for vinyl `A1/B1`). `fetchOriginalYear()` results are cached on disk at `~/.cache/music-audit/original-years.json`
- **info.txt**: written after Discogs tagging (rich: tracklist, personnel, durations, then `Discogs-Release:` / `Discogs-Master:` / `Disc:` lines); in repair mode only, silently created from existing tags if none exists. Never rewritten with the same text (a library mirror watches its mtime). Album and artist folder renames add a dated line to the Changeset section at the bottom (`renameAlbumFolder()` / `noteChange()` in repair.ts)
- **Old year bracket**: every repair that changes a folder's year (Discogs folder rename, YEAR_NOT_ORIGINAL) asks `askOldYearBracket()`; the answer is kept per album set for the run (`resetRepairSession()` at run start and in tests). The repair log records the final folder name
- **Split disc folders**: Discogs tagging uses only the folder's disc (see disc-split.ts); a master entered for a disc folder resolves to a CD version with that many discs (`pickMasterVersion()`); index entries (suites with sub-tracks) count as one track (`flattenTracklist()`)
- **File renames**: after Discogs tagging, preview + apply renames to `NN - Title.ext`, also in a `(Disc n∕m)` folder (`dDtNN - Title.ext` only when one folder holds the files of several discs) to prevent NAME_TAG_MISMATCH on next audit run
- **`--retag`**: implies `--repair`; visits all albums including those that already pass, offering Discogs enrichment
- **Release ID parsing**: accepts `4565937`, `r4565937`, `[r4565937]`, full Discogs release URLs, and master IDs (`m1439`, `[m1439]`, master URLs), which resolve to the master's main release (for a disc folder: `pickMasterVersion()`)
- **Suggested release ID**: the album's own (tags, else the comment URL / `info.txt` via `releaseIdFrom()`), then the other disc folders' (`siblingReleaseId()`), then the top search hit
- **Folder rename safety**: all renames go through `guardedRename()` which checks for pre-existing target before calling `fs.rename`
- **UX**: Enter defaults to action `[1]`; Esc in release picker throws `BackSignal` → returns to action menu; Enter in release ID prompt uses the suggested ID; `b` opens browse list; `[d]` in any issue menu retags the album from a chosen Discogs release; `o` at any prompt starts the album over

### Testing (audit)

- `pnpm --filter @hansogj/music-audit run precommit`: vitest with 80% coverage thresholds, then tsup build. `repair.ts`, `discogs.ts`, `tags.ts`, `tag-write.ts`, `audit.ts`, `report.ts`, `server.ts` and a few others are excluded from coverage (`vitest.config.ts`), but `repair.ts` and `discogs.ts` still have tests.
- `repair.test.ts` drives `repairAlbum()` end to end: fake "audio" files hold their tags as JSON (mocked `tags.js` / `tag-write.js`), prompts are scripted with `setPrompt()` (an unexpected prompt fails the test), and `fetchRelease` is mocked per test with `mockResolvedValueOnce`.
- Audio files (`*.mp3`, `*.flac`) are gitignored, so tests must build every file they use; `tag-write.test.ts` is skipped where `id3v2` is missing (CI).
- Discogs fixtures mirror real API shapes (positions, `index` entries with `sub_tracks`, master versions); check the live API (`curl https://api.discogs.com/releases/<id>`) when adding a case.
- No ESLint and no enforced Prettier in `scripts/audit` (several files are unformatted); format new files with `npx prettier --write <file>` only.

### Code style

- Prettier: 120 char width, single quotes, trailing commas
- ESLint flat config with TypeScript, Prettier, and import sort plugins
- Functional style with method chaining preferred over imperative loops
