# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript CLI toolkit for managing FLAC and MP3 music collections. Handles tag reading/writing, CD ripping, Discogs metadata lookup, cover art fetching, and folder structure normalization. Relies on external CLI tools: `metaflac`, `id3v2`, `cdparanoia`, `flac`, `ffprobe`, `file` (music-audit also `magick` for cover hashes).

pnpm monorepo (`pnpm-workspace.yaml`):

| Path | Package | Published | Bin |
|---|---|---|---|
| `packages/music-utils` | `@hansogj/music-utils` | yes | `music-utils`, `mu` (`build/run/cli.js`) |
| `packages/discogs-item-lookup` | `@hansogj/discogs-item-lookup` | yes | `discogs-lookup` |
| `packages/discogs-cover` | `@hansogj/discogs-cover` | yes | `discogs-cover` |
| `scripts/audit` | `@hansogj/music-audit` | no (`"private": true`) | `music-audit` (tsx, see below) |

GitHub Actions (`.github/workflows/build.yml`) runs the root `pnpm run precommit`, i.e. every package's precommit, on each PR. Run the same before pushing.

## Commands

**Package manager**: pnpm. Node 26.x via nvm; run nvm use to switch to the version in .nvmrc. pnpm is not installed by hand: nvm installs it automatically into each Node version from ~/.nvm/default-packages (maintained in the dotfiles repo). If pnpm is missing after nvm use, that Node version was installed before the list existed; run npm i -g pnpm once, or reinstall that version with nvm install. Don't use corepack, and don't install tooling with pnpm add -g.

From the repo root, `pnpm run build|test|lint|format:check|precommit` run that script in every package (`pnpm -r`). Inside `packages/music-utils`:

```bash
pnpm run build              # Clean + compile TypeScript with declarations
pnpm run vitest             # Run tests (default reporter)
pnpm run vitest:watch       # Run tests in watch mode
pnpm run vitest:ci          # Run tests with coverage thresholds
pnpm test                   # Full suite: vitest + vitest:ci + CI integration tests
pnpm run lint               # ESLint
pnpm run format:check       # Prettier check
pnpm run format:lint:fix    # Fix both lint and format issues
pnpm run typecheck          # tsc --noEmit on the full tsconfig (tests included)
pnpm run precommit          # Full pre-commit chain: test + lint + format:check + typecheck + tsc + build
```

**Releases**: Changesets only (root README, "Releases"). Add a `.changeset/*.md` with each user-facing change to a published package; `pnpm version-packages` on a branch, then `pnpm release` from `main`. `scripts/audit` is `"private": true` and never published. music-utils depends on discogs-cover and discogs-item-lookup with `workspace:<version>`: linked from the repo locally and in CI (no npm fetch, no release-age exemption), replaced by the real version when `pnpm publish` (used by `changeset publish`) packs it.

Test data is synced from `test-data/raw/` to `test-data/copy/` before tests (via `pretest`). CI integration tests in `ci/` run real tag operations against copied test files: synthetic 0.5s FLAC/MP3 files (made with ffmpeg, no music) and `tracks.txt`, committed despite the global `*.flac`/`*.mp3` ignore (negated for `packages/music-utils/test-data/raw` in `.gitignore`). Each script fails when its album has no audio (`ci/env/requireAudio.sh`) instead of passing on nothing; CI installs `flac` and `id3v2` for them.

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
- Definite articles ("the", "los", "il", etc.) can be moved to suffix position for artist sorting ("The Beatles" -> "Beatles, The"); off by default, enabled with `artist.sortArticles: true` in config. Only the artist tags (and track file names' artist) change, in `tag album` and rip; the artist folder keeps "The Beatles". music-audit reads the same setting (`scripts/audit/src/articles.ts`)
- `@hansogj/array.utils` provides `.defined()` (filter nullish) and `.onEmpty()` chainable array methods used extensively throughout
- `@hansogj/maybe` provides Maybe/Optional monad used for null-safe value access
- **rip tags like music-audit** (`src/run/rip.ts`): `artistChoicePrompt()` (prompt.ts: first credited artist / all credits / typed, only when Discogs credits several), `Release.discogs` (`DiscogsTags`: release/master ID, genre, URL) → FLAC ORIGINALDATE, GENRE, COMMENT, DISCOGS_RELEASE_ID, DISCOGS_MASTER_ID; DISCTOTAL instead of the old DISCID; MP3 TPE2; info.txt from discogs-item-lookup's `formatInfoTxt()`. The confirm prompt prints `releaseTable()` (utils/release-table.ts). Tags keep names as they are; `folderSafe()` (config/render.ts, as audit's `sanitizeFilename()`) makes artist/album folder names safe
- Shell commands are executed via `src/utils/execute.ts`: `executeFile` (using `child_process.execFile`, preferred for safety) and `execute` (using `child_process.exec`, for shell-dependent commands)

### Module layout

- `src/run/` - Entry point scripts (`cli.ts` is the bin; built, but excluded from test coverage). These orchestrate the CLI workflows (rip, tag album/tracks, covers, similarities, sync track names, completion).
- `src/config/` - `loadConfig()` (`./music-utils.config.json`, `~/.music-utilsrc.json`), `getConfig()` (cached), `validateConfig()`, defaults, and `render.ts` (folder/track name templates, `folderSafe()`)
- `src/utils/` - Cross-cutting: shell execution, path ops, CLI arg parsing (`cmd.options.ts`), shared `.env` (`env.ts`, kept in sync with audit's), colored logging, prompts, `releaseTable()`, tag ↔ path sync
- `src/artist/` - Artist folder name prompt
- `src/similarities/` - Fuzzy artist name matching
- `src/covers/` - Cover art from Discogs (`photo.ts`, via discogs-cover)
- `src/completion/` - Bash completion script
- `src/constants.ts` - `DISC_NO_SPLIT`, `COVER_FILE_NAME`, `TRACKS_FILE_NAME`, …

### Testing

- Vitest (`globals: true`, `vitest.setup.ts`), tests colocated with source (`*.test.ts`)
- Coverage thresholds (`vitest:ci`): 90% statements, 80% branches, 90% functions, 90% lines
- Mocks in `src/tag/__mocks__/` and `src/utils/__mocks__/`; `execute`, `path`, and tag reader modules are commonly mocked
- `src/run/`, `prompt.ts`, `color.log.ts`, `photo.ts`, `index.ts` files and `__mocks__/` are excluded from coverage

### TypeScript config

- Strict mode with `strictNullChecks: true`
- ESNext target, Node16 module resolution
- `tsconfig.build.json` excludes tests and mocks; `tsconfig.ci.json` is used for CI integration test compilation
- TypeScript 7 (the native compiler) runs side by side with TypeScript 6, as the TS 7 release notes describe: `"@typescript/native": "npm:typescript@7.0.2"` gives `tsc` (7), and `"typescript": "npm:@typescript/typescript6@6.0.2"` gives tools that need the compiler API (typescript-eslint, tsup's `.d.ts` build) TypeScript 6, plus a `tsc6` binary. TS 7 ships no JS API; drop the alias once typescript-eslint and tsup support TS 7.1's new API
- Every package type-checks with `pnpm typecheck` (`tsc --noEmit`) in its precommit: music-utils and discogs-item-lookup on their full `tsconfig.json` (tests included, `vitest/globals` in `types`), music-audit on `src/**` (tests included), discogs-cover on `src` without tests. music-utils' `tsconfig.build.json` sets `types: ["node"]`, so the build doesn't see the test globals. `describe.each` tables with `undefined` cases need a type argument or optional parameters

## `packages/discogs-item-lookup/` and `packages/discogs-cover/`

- **discogs-item-lookup**: `lookupRelease()` (index.ts) fetches a release + master through `core/api-client.ts`; `format.ts` (export `./format`) holds the helpers shared by rip and music-audit: `flattenTracklist()` / `fitTracklist()` (suites), `joinArtistCredit()`, `formatInfoTxt()`. Tests live in `tests/` (msw mocks in `tests/mocks`), not next to the source. Precommit: format:check, typecheck, test, build (tsup). No ESLint.
- **discogs-cover**: `discogsMainCover()` finds and downloads a release's main image; used by music-utils' `covers/photo.ts`. Precommit: format:check, typecheck, test, build. No ESLint, no coverage thresholds in either Discogs package.

## `scripts/audit/` — music-audit

Private, unpublished audit + repair CLI. Run with `pnpm --filter @hansogj/music-audit run audit -- [options]` or via the installed `music-audit` binary. The binary (`scripts/audit/bin/music-audit`, linked by `scripts/install-bins.sh`) runs `src/audit.ts` from this checkout through tsx: the checked-out branch is what runs, with no build or publish step. It imports `@hansogj/discogs-item-lookup/format` (`workspace:<version>`) from that package's `src/` through the `@hansogj/source` export condition (tsx `--conditions`, vitest `resolve.conditions`, tsup `esbuildOptions`, tsconfig `customConditions`), so the package needs no build either; `publishConfig.exports` leaves the condition out of the published package. User docs, including the prompt keys: `scripts/audit/README.md`.

### Architecture

```
scripts/audit/src/
  audit.ts        — CLI entry: arg parsing, walk → audit → report/repair/ui/json
  types.ts        — AlbumAudit, Issue, TrackTags, Severity
  env.ts          — shared ~/.config/music-utils/.env (as music-utils' utils/env.ts; sudo-safe home)
  completion.ts   — bash completion script (`pnpm --dir scripts/audit run --silent completion`)
  term-link.ts    — OSC 8 terminal hyperlinks (plain "text <url>" without a TTY)
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
                    folder), numberTracklist(), fitsFolder(); flattenTracklist() / fitTracklist() (suites,
                    see Suites below) and joinArtistCredit() come from discogs-item-lookup/format; fetchReleaseCover() / downloadImage() / discogsCoverSource()
                    (cover hashes cached in ~/.cache/music-audit/cover-hashes.json); all HTTP through discogsGet(), which waits on
                    the shared rate limiter and retries 429/500; releases cached per session
  similarity.ts   — scoreTracklist(): fuzzy match local track names vs Discogs
  progress.ts     — progressBar() ("▕███░░▏ n/m  p%"), LiveProgress (one redrawn stderr line)
  rate-limit.ts   — RateLimiter: moving 60s window sized from X-Discogs-Ratelimit headers
                    (60/min with a token, 25 without), one shared pause on 429;
                    interactive() gives repair-prompt requests slots the scan can't use
  repair.ts       — runRepair() → repairAlbum() per album (restart on o) → repairAlbumPass():
                    repairIssues() (discogsFirstStep(), then repairIssue() per issue: chooseAction()
                    menu, offerBulkMismatch(), runAction(); askAfterPass()), then
                    applyPendingFolderRename(); PassState holds a pass's handled issues, bulk
                    choice and skip bracket. scanLine(), printSessionSummary(); re-exports
                    setPrompt(), resetRepairSession(), splitArtistBrackets(), formatSummary(), AuditStream
  repair/
    prompt.ts         — ask() (o → RestartSignal while setRestartable(true)), askLines(),
                        setPrompt() for tests, BackSignal (Esc → action menu), closeRl()
    release-picker.ts — pickRelease() (raw-mode list), parseReleaseRef(), yearLabel()
    folder.ts         — folderTitle(), albumMetaFromLayout(), splitArtistBrackets(),
                        planFolderRename() / askFolderRename() / applyFolderRename() (pending
                        rename, applied last), askSkipAux(), askSetAux(), askOldYearBracket(),
                        chooseArtist(), renameAlbumFolder(), noteChange(), moveToArtist();
                        per-run answers reset by resetRepairSession()
    discogs-action.ts — RepairAction; discogsActionFor() / buildDiscogsAction() (release
                        prompt, chooseDiscSlice(), tag write, info.txt, file renames, folder
                        rename plan); taggedReleaseId()
    tagging.ts        — tagFromTracklist() (pair + write), offerFileRenames(), tagFromPaste()
    issue-actions.ts  — repairActions(): the actions offered per issue code, from a table of
                        handlers (one ActionsFor function per code; none → no automated repair)
    covers.ts         — coverActions(), downloadCover()
    album-table.ts    — printAlbumTable() (opening table; Format row from formatSummary(): only
                        mp3/flac are read, others "(not checked)"), folderFiles()
    stream.ts         — AuditStream (background scan queue), RepairEvent, ScanProgress
  rename-plan.ts  — sanitizeFilename() ("/" and ":" → " - "), pairWithRelease() (by disc/no,
                    else by order: one folder of a 2-CD release), pairingProblem() (asks
                    before tagging when titles repeat), checkRenames() (no renames that clash),
                    planPairing() (an unnumbered file is placed by title, or is an extra copy)
  cover.ts        — checkCovers(): cover.jpg and folder.jpg are equals (coversIn()); MISSING_COVER
                    (neither), per cover file BAD_COVER (not an image) and COVER_MISMATCH
                    (perceptual hash via `magick`, pHash of a 32×32 thumbnail, ≤16 bits = same
                    cover; release's cover, then the master's), ARTIST_COVER_MISSING (no readable one); writeCover(), artistCoverCandidates(),
                    withoutSolvedCoverIssues() (runRepair drops an artist cover issue solved since)
  folder-move.ts  — guardedRename() (no overwrite; case-only renames via a temp name),
                    moveAlbumToArtist() (one album to another artist folder, also under another
                    letter folder (WRONG_LETTER_DIR), joining one there of any case; old one
                    removed when empty)
  report.ts       — printReport(); terminal-formatted severity sections
  server.ts       — serveReport(): HTML UI mode (--ui flag)
  logger.ts       — AuditLogger: JSON Lines session/album/summary events (--log)
  info-txt.ts     — writeInfoTxt() (Discogs-rich, text from discogs-item-lookup's
                    formatInfoTxt(), shared with rip); writeInfoTxtFromTags() (fallback); both skip
                    the write when the text is unchanged; appendChangeset() (dated lines under
                    a Changeset header at the bottom, kept across rewrites)
  paste.ts        — parsePastedTracklist(): a tracklist the user pastes (titles, "01 - Title",
                    "A1 Title", "1-03 Title"; trailing duration dropped; positions only when
                    every line has one) → NumberedTrack[] for tagFromPaste() in repair/tagging.ts
  year-bracket.ts — oldYearBracket() (l → live YYYY, r → rec. YYYY: appended), customAux()
                    (c: the folder's brackets, pre-filled via ask(q, prefill), edited and
                    replacing them; plain text → a bracket), applyOldYear(), albumSetKey()
                    (one answer per disc set). Also used by the skip prompt (askSkipAux)
  disc-split.ts   — sliceForDisc(): the part of a Discogs release one "(Disc n∕m)" folder
                    holds (release disc numbers, else a window placed by the other disc
                    folders' track counts and title match); discOfFolder()
  disc-siblings.ts — siblingDiscs(): the album's other disc folders (track counts, release
                    ID from info.txt/tags; brackets ignored unless two folders claim one
                    disc) → expected start, suggested release; siblingWithRelease()
  checks/
    folder.ts     — WRONG_LETTER_DIR, MISSING_YEAR_PREFIX, WRONG_DISC_SEPARATOR,
                    WRONG_AUX_BRACKETS
    tags.ts       — NO_TAGS, MISSING_TAGS, TAG_READ_ERROR
    names.ts      — NAME_TAG_MISMATCH; parseTrackNames() (per album: "_" → space, drops
                    leading " - " parts only when every track has them, then the track
                    number), localNumbering() (by order when numbers are missing/shared),
                    matchNames() (local titles for Discogs scoring)
    artist.ts     — ARTIST_TAG_INVERTED ("Doors, the" for "The Doors"), ARTIST_FOLDER_MISMATCH:
                    no track's ALBUMARTIST (else ARTIST) is the artist folder's name, brackets
                    included (tags carry them); NFC, case-insensitive, diacritics kept; Various
                    Artists skipped. Repair: move the album to the tags' artist (expectedLetter();
                    [1], the default), or folder name → ALBUMARTIST (+ ARTIST where empty/same).
                    Hidden while an artist folder rename is pending (rescanAlbum()).
                    expectedArtistTag(): with music-utils' artist.sortArticles on, "Beatles, The"
                    for folder "The Beatles"
  articles.ts     — loadArticleSort() (./music-utils.config.json, ~/.music-utilsrc.json, as
                    music-utils' config/load.ts), sortArtist() / unsortArtist(); every tag
                    write of the artist (Discogs, paste, folder, artist fix) goes through
                    sortArtist(); tests run with it off (test-setup.ts, setArticleSort())
    duplicates.ts — DUPLICATE_TRACKS: whole titles, qualifier included; not when every copy
                    has its own number (tag, else file name: 06 and 12); likelyExtras()
    discogs-ids.ts — MISSING_RELEASE_ID: mp3 with a master ID but no release ID (lost by
                    the 81963c0/43bd432 writer); repair restores it from the comment URL
                    or info.txt, or retags from a chosen release
    year.ts       — YEAR_NOT_ORIGINAL (opt-in: --check-years or MUSIC_AUDIT_CHECK_YEARS=true
                    in the shared .env; needs Discogs + DISCOGS_RELEASE_ID tag)
```

### Key behaviours

- **Discogs scoring**: fetches tracklists for up to 3 candidates in parallel (plus the first CD/File hit when none of them is one: `candidatesToScore()`), ranks by fuzzy title similarity (`scoreTracklist`); `rankResults()` puts a digital release (`isDigital()`: CD, CDr, SACD, DVD-Audio, File in the search result's `format`) before vinyl within 5 points (rounded %). The format is shown in the album table, the release picker and the suggestion line (`formatLabel()`)
- **Discogs rate limit**: every request waits for a slot in `discogsLimiter` (rate-limit.ts), so the background scan stays under the limit instead of retrying 429s; a 429 that still happens (same token used elsewhere) pauses all requests 5→10→20→40→60s, up to 8 attempts. The Discogs action in repair runs inside `interactive()`
- **Streaming repair**: `AuditStream` producer/consumer queue — scan runs in background while user handles already-found albums interactively
- **Scan progress** (`progress.ts`): report mode redraws a `▕███░░▏ n/m  p%` line on stderr (`LiveProgress`, TTY only); repair mode shows it in each album header with the album's number (`scanLine()`: "Album 3 of 17 so far" from `AuditStream.progress` `taken`/`found`) and live only while waiting for the scan (`stream.waiting`), since a prompt can't share a redrawn line. Messages written during a live line start with `CLEAR_LINE`
- **Discogs first** (`discogsFirstStep()` in repair.ts): with a token, an album without a release ID (`knownReleaseId()`: DISCOGS_RELEASE_ID tag, comment URL or info.txt; `AlbumAudit.releaseId`) opens with Discogs tagging before its issues, whatever they are; the repair scan searches such albums too (`searchUntagged`) and queues them even without issues. Menu: tag from a release, paste the tracklist (`tagFromPaste()`: titles/numbers from the list, artist/album/year from the folder, always previewed, info.txt only replaced when it was made from the old tags), `[f]` the issues one by one, `[s]` skip the album. No search hit → `[1]` is "Enter a Discogs release ID", paste stays `[2]`. An album with a release ID is trusted (not fetched); `--retag` gives every album this step. On only when `ctx.discogsFirst` (set by `runRepair()`), so most `repair.test.ts` tests start at the issues
- **No token**: there is no `--no-discogs`; without `DISCOGS_TOKEN` music-audit asks (on stderr) to continue offline or quit with how to add one; without a TTY it goes on offline (scripts and the docker test run with `DISCOGS_TOKEN=`)
- **Per-album repair** (`repairAlbum()`): after every fix the album is re-scanned from disk (no new Discogs search), so issues a Discogs retag solved or changed are never shown out of date. A folder rename the user agrees to is stored and applied last, after all file-level fixes for that album, so nothing points at the old path. Answering `o` at any prompt throws `RestartSignal`: the album starts over from its opening table (re-scan, pending folder rename dropped, written changes kept). When issues are left, one prompt ends the album ("[Enter] Next album [r] Retry [q] Quit"); a skipped album (Discogs-first `[s]`) ends without one. Tests answer prompts through `setPrompt()`
- **Repair log**: JSON Lines at `~/.local/share/music-audit/YYYY.MM.dd.HH.mm-repair.log`; each event written immediately (crash-safe). Log is audit history only — issues are always shown if audit detects them (no auto-skip on resume)
- **Audit log**: `--log` flag writes session/album/summary events to `~/.local/share/music-audit/YYYY.MM.dd.HH.mm-audit.log` (or `--log=<path>`)
- **Report mode is read-only**: without `--repair`/`--retag` nothing in the library is written
- **Tag writes**: FLAC via `metaflac`, MP3 via `id3v2` for standard frames and `id3-frames.ts` for TXXX (Discogs IDs) and COMM (empty description, full URL). Both include post-write verification (TRACKNUMBER/DATE checked before TITLE) to catch silent NFS/CIFS write failures. Fields written from Discogs: TITLE, ARTIST, ALBUMARTIST, ALBUM, DATE, ORIGINALDATE (MP3: TORY), TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (release URL), DISCOGS_RELEASE_ID and DISCOGS_MASTER_ID (MP3: TXXX with description; JSON report: `tags.discogsReleaseId` / `tags.discogsMasterId`)
- **Original year & title**: DATE, ORIGINALDATE, ALBUM and the folder's year/title always use the Discogs **master** (falling back to the release), never a reissue's year or title. Tracks are matched by numeric position when all positions are numeric, else by listing order (`numberTracklist()`, for vinyl `A1/B1`). `fetchOriginalYear()` results are cached on disk at `~/.cache/music-audit/original-years.json`
- **info.txt**: written after Discogs tagging (rich: tracklist, personnel, durations, then `Discogs-Release:` / `Discogs-Master:` / `Disc:` lines); in repair mode only, silently created from existing tags if none exists. Never rewritten with the same text (a library mirror watches its mtime). Album and artist folder renames add a dated line to the Changeset section at the bottom (`renameAlbumFolder()` / `noteChange()` in repair/folder.ts)
- **Bracket after a skip**: the first `[s]` in an album (issue menu or the Discogs-first step) asks `askSkipAux()` for the folder's brackets, pre-filled with the current ones (e.g. add `bootleg`); stored as `aux` in the pending folder rename (`planFolderRename()` merges it with a Discogs rename) and applied last
- **Old year bracket**: every repair that changes a folder's year (Discogs folder rename, YEAR_NOT_ORIGINAL) asks `askOldYearBracket()`; the answer is kept per album set for the run (`resetRepairSession()` at run start and in tests). The repair log records the final folder name
- **Suites** (Discogs index entries; `flattenTracklist()` / `fitTracklist()` in discogs-item-lookup/format): parts with track numbers of their own (Dice r11456763: "War" a)–d) on tracks 1–4) are tracks of their own, titled "War; a) Ouverture" (`suite`/`part` fields; info.txt lists them under a " War" heading); lettered parts ("1-5.a", "B2a") make one track. When that count doesn't match the files, the other reading (all split / all joined) is used if it fits: `fitsFolder()` in discogs.ts for search scoring, `pickMasterVersion()` and Discogs tagging (`ReleaseInfo.rawTracklist`); rip re-reads with `lookupRelease({ trackCount })` after ripping
- **Split disc folders**: Discogs tagging uses only the folder's disc (see disc-split.ts); a master entered for a disc folder resolves to a CD version with that many discs (`pickMasterVersion()`); suites (index entries with sub-tracks) follow `flattenTracklist()` / `fitTracklist()` (below)
- **File renames**: after Discogs tagging, preview + apply renames to `NN - Title.ext`, also in a `(Disc n∕m)` folder (`dDtNN - Title.ext` only when one folder holds the files of several discs) to prevent NAME_TAG_MISMATCH on next audit run
- **`--retag`**: implies `--repair`; visits all albums including those that already pass, each opening with the Discogs-first step (its own release ID suggested)
- **Release ID parsing**: accepts `4565937`, `r4565937`, `[r4565937]`, full Discogs release URLs, and master IDs (`m1439`, `[m1439]`, master URLs), which resolve to the master's main release (for a disc folder: `pickMasterVersion()`)
- **Disc set release**: in a disc folder whose sibling was tagged already, the Discogs action first asks "Use the same release ID [rN] as Disc k? [Y/n]" (`siblingWithRelease()`); a no drops that ID from the suggestion. After a yes, `askSetAux()` offers keep / Disc k's brackets / type new when they differ (minus the set's old-year bracket); the first skip in such a folder asks the same instead of the plain bracket editor
- **Suggested release ID**: the album's own (tags, else the comment URL / `info.txt` via `releaseIdFrom()`), then the other disc folders' (`siblingReleaseId()`), then the top search hit
- **Folder rename safety**: all renames go through `guardedRename()` (folder-move.ts), which refuses to overwrite and does a case-only rename ("Speed of Love" → "Speed Of Love") via a temporary name: on an SMB share the target "exists" already, being the folder itself. Albums are compared by `folderTitle()` (parentheses kept), so a case difference isn't offered as a rename
- **One artist name** (`chooseArtist()` in repair/folder.ts): Discogs tagging picks one name for the artist folder, ARTIST/ALBUMARTIST and the info.txt header before writing (it used to tag the folder's name while the folder rename and header took Discogs': they drifted apart). Asked only when folder, Discogs' first artist and the tags' most common album artist differ: Enter Discogs', `k` the folder's, `a` `ReleaseInfo.artistCredit` (`joinArtistCredit()`, every credit with Discogs' `join`s, `/` as `, `, only when several). The folder's brackets are added to the tags and header too ("Dionysos [Canada]": same-named artists stay apart in players); tags are compared without them. `askFolderRename()` then renames the artist folder to it unasked (compared as ARTIST_FOLDER_MISMATCH does: punctuation counts, so "Kaada, Mike Patton" renames "Kaada & Mike Patton"; album titles ignore it, any script's letters count); answer kept per album set (`artistAnswers`)
- **Artist change** (`moveAlbumToArtist()`): only the album moves, into the new artist folder (created, or joined when it exists); the old artist folder is kept while it has other albums, else its files (cover.jpg) follow and it is removed, `@eaDir`/`.DS_Store`/`Thumbs.db` and all. A change of case only renames the whole artist folder. The artist folder's trailing `[...]` ("Dionysos [Canada]") is ignored when comparing with the Discogs artist and kept on a rename (`splitArtistBrackets()`)
- **Covers** (`cover.ts`, on unless `--no-covers`; `auditAlbum({ checkCovers })` defaults off, so tests opt in): `cover.jpg` or `folder.jpg` (equals) in every album and artist folder; with Discogs, each cover file is compared with the release's front image (150px thumbnail), then the master's. Repair writes under the issue's file name (`issue.file`; cover.jpg when none): the release/master/entered cover (600px `uri`), the folder's other good cover file, or another image (one matching Discogs first); or copies an album cover to the artist folder; cover changes are noted in info.txt's Changeset. Images from `i.discogs.com` don't go through the rate limiter
- **UX**: Enter defaults to action `[1]`; Esc in release picker throws `BackSignal` → returns to action menu; Enter in release ID prompt uses the suggested ID; `b` opens browse list; `[d]` in any issue menu retags the album from a chosen Discogs release; `o` at any prompt starts the album over

### Testing (audit)

- `pnpm --filter @hansogj/music-audit run precommit`: ESLint, Prettier check, typecheck (`tsc --noEmit`), vitest with coverage thresholds (90% statements/functions/lines, 85% branches), then tsup build. `repair.ts`, `repair/prompt.ts` and `repair/release-picker.ts` (TTY glue), `tags.ts`, `tag-write.ts`, `audit.ts`, `report.ts`, `server.ts`, `logger.ts`, `completion.ts`, `term-link.ts` and `types.ts` are excluded from coverage (`vitest.config.ts`); all of `repair/` is exercised by `repair.test.ts`; `repair/issue-actions.test.ts`, `repair/covers.test.ts` and `repair/discogs-action.test.ts` call `repairActions()` / `coverActions()` / `discogsActionFor()` directly (one test per issue code; the release ID prompt, master IDs, the browse list with `pickRelease()` mocked, disc slices). Every other `repair/` file is counted.
- `repair.test.ts` drives `repairAlbum()` end to end: fake "audio" files hold their tags as JSON (mocked `tags.js` / `tag-write.js`), prompts are scripted with `setPrompt()` (an unexpected prompt fails the test), and `fetchRelease` is mocked per test with `mockResolvedValueOnce`.
- Audio files (`*.mp3`, `*.flac`) are gitignored (except music-utils' CI test albums), so tests must build every file they use; `tag-write.test.ts` is skipped where `id3v2` is missing (CI installs it now), the cover hash tests where `magick` (ImageMagick 7) is missing.
- Discogs fixtures mirror real API shapes (positions, `index` entries with `sub_tracks`, master versions); check the live API (`curl https://api.discogs.com/releases/<id>`) when adding a case.
- Lint and format are enforced in `scripts/audit` (`eslint.config.mjs`: recommended + typescript-eslint + simple-import-sort; Prettier via `format` / `format:check`). Fix with `pnpm --filter @hansogj/music-audit exec eslint . --fix && pnpm --filter @hansogj/music-audit run format`.

### Code style

- Prettier: 120 char width, single quotes, trailing commas
- ESLint flat config with TypeScript, Prettier, and import sort plugins
- Functional style with method chaining preferred over imperative loops
