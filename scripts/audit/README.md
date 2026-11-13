# music-audit

Private, unpublished CLI for auditing and interactively repairing a local FLAC/MP3 music library. Not part of the published npm packages.

## What it checks

| Check | Severity | Description |
|-------|----------|-------------|
| Folder starts with 4-digit year | SEVERE | e.g. `1984 No Return` |
| Correct disc separator (`∕` U+2215) | SEVERE | e.g. `(Disc 1∕2)` |
| Auxiliary info in `[]` not `{}` | SEVERE | |
| Artist under correct `[A-Z]` letter dir | SEVERE | Articles stripped for sorting |
| All required tags present | HIGH | TITLE, ARTIST, ALBUM, DATE, TRACKNUMBER |
| Filename matches TITLE tag | MODERATE | |
| Duplicate track names | MODERATE | The same title twice, qualifier included: `Sweet Dreams` and `Sweet Dreams (Original Mix)` are different tracks. Files without a track number count too; the message names the likely extra copy (no number in its name, then no TITLE tag) |
| MP3 has a Discogs master ID but no release ID | HIGH | Left by repairs with music-audit 81963c0/43bd432. Repair restores the release ID from the Discogs URL comment or `info.txt`, and rewrites the comment as one full URL, or retags the album from a release you choose |
| Year is the original release year | HIGH | **Opt-in** (`--check-years`, or `MUSIC_AUDIT_CHECK_YEARS=true` in `~/.config/music-utils/.env`). Albums tagged with a Discogs release ID: folder/DATE year must match the master's year, not a reissue's (e.g. a 1989 reissue of *In Rock* → `1970`). Needs Discogs; results are cached in `~/.cache/music-audit/original-years.json` |

## Usage

```bash
# Audit only (no Discogs lookups)
pnpm --filter @hansogj/music-audit run audit -- --root /mnt/music --no-discogs

# Audit with Discogs suggestions (top 5 releases, scored against local track names)
pnpm --filter @hansogj/music-audit run audit -- --root /mnt/music --token YOUR_TOKEN

# Point at a single album folder
music-audit --root /mnt/music/Z/ZAO/1976\ Kawana --token YOUR_TOKEN

# Interactive repair — step through issues album by album
sudo music-audit --repair --root /mnt/music --token YOUR_TOKEN

# Re-tag everything (including albums that already pass) with Discogs enrichment
sudo music-audit --retag --root /mnt/music --token YOUR_TOKEN

# Serve HTML report in browser
music-audit --ui --root /mnt/music --token YOUR_TOKEN
```

### What is sent to Discogs

With `--no-discogs`, nothing leaves your machine. Otherwise requests go to `api.discogs.com`, authenticated with your token:

- artist and album title (from the folder name) for albums with issues — every album with `--retag`
- with the year check on: the Discogs release ID from the tags of every tagged album (once; then cached)

File names, paths and track titles are never sent; tracklist matching happens locally.

Discogs allows 60 requests a minute with a token (25 without). music-audit keeps under that limit by itself: when the budget is used up, the scan waits for it to free up again. A release you ask for at a repair prompt goes ahead of the scan. If Discogs still answers "429 Too Many Requests" (for example when the same token is in use on another machine), all requests pause together, for 5s, then 10, 20, 40 and 60s, and one line says so.

To turn the year check on permanently, add this to `~/.config/music-utils/.env` (override per run with `--no-check-years`):

```
MUSIC_AUDIT_CHECK_YEARS=true
```

`DISCOGS_TOKEN` can also be set as an environment variable or in `~/.config/music-utils/.env` (shared with the music-utils CLIs; under `sudo` the invoking user's home is used) instead of `--token`.

## Flags

| Flag | Description |
|------|-------------|
| `--root=<path>` | Root of music library (default: cwd) |
| `--token=<token>` | Discogs personal access token |
| `--no-discogs` | Skip all Discogs API calls |
| `--repair` | Interactive repair mode |
| `--retag` | Like `--repair` but visits clean albums too |
| `--ui` | Serve HTML report at `http://localhost:7171` |
| `--json` | Raw JSON output (incompatible with `--repair`/`--ui`) |
| `--log[=<path>]` | Append JSON Lines audit log (default: `~/.local/share/music-audit/YYYY.MM.dd.HH.mm-audit.log`) |

Without `--repair`/`--retag` the audit only reads: nothing in the library is written.

## Repair mode

`--repair` (or `--retag`, which implies repair) walks album-by-album through issues and offers automated fixes:

- **Folder renames** — year prefix, disc separator, bracket style, letter-dir moves
- **Discogs tagging** — fetches tracklist, writes TITLE, ARTIST, ALBUM, DATE, ORIGINALDATE (`TORY` for MP3), TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (Discogs URL), DISCOGS_RELEASE_ID, DISCOGS_MASTER_ID (MP3: TXXX frames; in the `--json` report as `tags.discogsReleaseId` / `tags.discogsMasterId`); offers to rename files (`01 - Title.mp3`, also inside a `(Disc n∕m)` folder; `d2t01 - Title.mp3` only when one folder holds several discs) and folders (including the year) to match. DATE/ORIGINALDATE and ALBUM always come from the Discogs **master** (original year and title), not from the specific pressing; the pressing's year goes in `info.txt` as `Reissue:`
- **Original year** — sets DATE/ORIGINALDATE to the master year and renames the folder's year prefix
- **Old year in a bracket** — whenever a repair changes a folder's year, it asks what to do with the old one: `[Enter]` no bracket, `l` → `[live 1978]`, `r` → `[rec. 1978]`, both added last, after the disc part and any brackets the folder has: `1992 Tourmato (Disc 1∕2) [FLAC] [live 1979]`. `c` puts the folder's brackets as they are (`[FLAC]`, or `[1978]` when it has none) in the input line to edit; what you enter replaces them (plain text becomes one bracket, an empty line removes them). Folder name only: the ALBUM tag gets no bracket. The other discs of a set get the same answer without asking
- **Extra copies** — when tagging from Discogs, a file without a track number whose title matches a release track that already has a file is an extra copy: it is not tagged, and the track total stays the release's
- **Folder/artist rename** — detects when Discogs artist or album title differs from local folder names
- **Name/tag sync** — rename file to match tag, or update tag to match filename

Each album opens with a table: artist, album, year and disc from the folder name, how many tracks have tags, the audio formats in the folder (`FLAC`, `FLAC 5 · MP3 2`; formats music-audit doesn't read, such as WAV or M4A, are marked `(not checked)`: those files aren't checked or tagged) and the path.

The library is scanned in the background while you repair. Each album's header shows how far the scan has come (`Scan ▕████░░░░▏ 120/340  35%`), and when you have handled every album found so far, a live bar runs until the next one turns up. Report mode shows the same bar while it scans.

After each fix the album is scanned again, so the next issue shown matches the files as they are now: Discogs tagging often solves a name/tag mismatch, and that issue is then not shown at all. When you agree to rename the album or artist folder, the rename waits until the album's other fixes are done.

### Prompt keys

| Key | Where | Does |
|-----|-------|------|
| Enter | issue menu | the first action, `[1]` |
| `1`–`9` | issue menu | that action |
| `d` | issue menu | tag the whole album from a Discogs release you choose |
| `l` | issue menu | list the album's files |
| `s` / `q` | issue menu | skip this issue / quit repair; the first skip in an album offers to add a bracket to its folder name (below) |
| `o` | any prompt | start this album over (below) |
| `b` | release ID prompt | browse the search results; Esc goes back to the issue menu |
| `n` | disc pairing | start the disc at another release track |
| `r` | after an album's issues | go through the ones not fixed again |

**A bracket after a skip.** Skipping often means Discogs doesn't know the album, for instance a bootleg. The first time you skip an issue in an album (also the `--retag` offer), you can note that in the folder name:

```
  Add to the folder name (e.g. bootleg)? Edit the brackets; Enter leaves them.
    Brackets: bootleg
  → folder becomes "1978 Live in Paris [bootleg]" after this album's other fixes
```

The input starts with the brackets the folder has (`[FLAC]`), to edit or add to: plain text becomes a bracket (`[FLAC] bootleg` → `[FLAC] [bootleg]`), and an empty line removes them all. Enter leaves the name as it is. The rename runs last, with a Discogs rename if there is one, and is noted in `info.txt`.

Regret a choice? Answer `o` at any prompt (or pick `[o] Start album over` in the issue menu) to go back to the album's opening table: the album is scanned again and its issues shown from the top. A folder rename you agreed to but that hasn't run yet is dropped; tags and file renames already written stay (tag again from Discogs to overwrite them).

### Choosing the Discogs release

Discogs tagging is offered for missing tags and for a missing release ID. On any other issue, press `d` to tag the whole album from a release of your choice.

Release IDs are accepted as plain numbers (`4565937`), `r4565937`, `[r4565937]`, or full Discogs URLs. Master IDs (`m1439`, `[m1439]`, master URLs) are accepted too and resolve to the master's main release (for a disc folder, see below). For an edition with bonus tracks enter that edition's release ID: the tracks get its tracklist and release ID, and still get the master ID and the master's year.

Enter at the release ID prompt takes the suggested ID, in this order:

1. the release the album is already tagged with, or the one in its Discogs comment or `info.txt`
2. for a disc folder, the release the album's other disc folders were tagged from
3. the best search hit (`b` opens all search results)

**Albums split into disc folders** (`1973 Yessongs (Disc 1∕2)`, `… (Disc 2∕2)`): each folder is tagged from its own part of the release, numbered per disc (TRACKNUMBER `n/7`, DISCNUMBER `2/2`).

- Where the release numbers its discs (`1-1`/`2-1`, or numbering that starts again at 1), that disc's tracks are used as listed.
- Where it doesn't (vinyl sides `A1`…`F2`, `1`…`15` straight through), disc *n* is placed after the tracks of the other disc folders, checked against your titles; without the other folders, by titles alone. The track-by-track pairing is shown first: Enter accepts it, `n` starts the disc at another release track. If neither titles nor other folders tell, you're asked for the start track.
- A master ID entered for a disc folder resolves to a CD version with that many discs (and, preferably, this disc's track count) instead of the master's main release, which is often the original vinyl.
- Once one disc folder is tagged, the others suggest the same release.
- Discogs "index" entries (a suite listed with its parts, e.g. *And You And I*) count as one track.
- The search's match score compares a disc folder with its own part of the release.

Logs go to `~/.local/share/music-audit/`:

- `YYYY.MM.dd.HH.mm-repair.log` — JSON Lines repair log (every fix attempt, crash-safe); always written in repair mode
- `YYYY.MM.dd.HH.mm-audit.log` — JSON Lines audit log (albums scanned, issues found, summary); only with `--log`

After Discogs tagging, an `info.txt` is written to the album folder with artist, tracklist, personnel, and durations, ending in fixed lines for scripts:

```
Discogs-Release: 9004392
Discogs-Master: 123456
Disc: 1/2
```

In repair mode, albums without an `info.txt` also get a basic one built from their tags. An `info.txt` whose text would not change is not written again (its modification time stays).

Folder renames are noted at the bottom of `info.txt`, below the rest of the file, which is left as it is; a later Discogs rewrite keeps the section:

```
===============Changeset==============
[2026-11-12 10:45]: folder name was changed from "1979 Tourmato" to "1992 Tourmato [live 1979]"
```

## Install the binary system-wide

```bash
sudo bash scripts/install-bins.sh
```

This links `/usr/local/bin/music-audit` to `scripts/audit/bin/music-audit`, which runs `src/audit.ts` from this checkout through tsx. There is no build or publish step: whatever branch is checked out is what runs, and `git pull` is the update. Under `sudo` the wrapper finds node under `~/.local/share/pnpm/nodejs/`.

## Development

```bash
pnpm --filter @hansogj/music-audit run vitest      # tests
pnpm --filter @hansogj/music-audit run precommit   # tests with coverage (80%) + build
```

- Tests answer prompts through `setPrompt()` and use fake audio files that hold their tags as JSON (`repair.test.ts`), so they need neither `metaflac`/`id3v2` nor real audio. Audio files are gitignored: a test must create every file it uses.
- `tag-write.test.ts` runs only where `id3v2` is installed (CI doesn't have it).
- Discogs is mocked; fixtures follow the real API shapes (e.g. the *Yessongs* tracklists in `disc-split.test.ts`).
- No lint is configured for this package, and Prettier isn't enforced here.
