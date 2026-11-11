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
| Duplicate track numbers | MODERATE | |
| MP3 has a Discogs master ID but no release ID | HIGH | Left by repairs with music-audit 81963c0/43bd432. Repair restores the release ID from the Discogs URL comment or `info.txt`, and rewrites the comment as one full URL |
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
- **Discogs tagging** — fetches tracklist, writes TITLE, ARTIST, ALBUM, DATE, ORIGINALDATE (`TORY` for MP3), TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (Discogs URL), DISCOGS_RELEASE_ID, DISCOGS_MASTER_ID (MP3: TXXX frames; in the `--json` report as `tags.discogsReleaseId` / `tags.discogsMasterId`); offers to rename files and folders (including the year) to match. DATE/ORIGINALDATE and ALBUM always come from the Discogs **master** (original year and title), not from the specific pressing; the pressing's year goes in `info.txt` as `Reissue:`
- **Original year** — sets DATE/ORIGINALDATE to the master year and renames the folder's year prefix
- **Folder/artist rename** — detects when Discogs artist or album title differs from local folder names
- **Name/tag sync** — rename file to match tag, or update tag to match filename

After each fix the album is scanned again, so the next issue shown matches the files as they are now: Discogs tagging often solves a name/tag mismatch, and that issue is then not shown at all. When you agree to rename the album or artist folder, the rename waits until the album's other fixes are done.

Release IDs are accepted as plain numbers (`4565937`), `r4565937`, `[r4565937]`, or full Discogs URLs. Master IDs (`m1439`, `[m1439]`, master URLs) are accepted too and resolve to the master's main release.

Logs go to `~/.local/share/music-audit/`:

- `YYYY.MM.dd.HH.mm-repair.log` — JSON Lines repair log (every fix attempt, crash-safe); always written in repair mode
- `YYYY.MM.dd.HH.mm-audit.log` — JSON Lines audit log (albums scanned, issues found, summary); only with `--log`

After Discogs tagging, an `info.txt` is written to the album folder with artist, tracklist, personnel, and durations, ending in fixed lines for scripts:

```
Discogs-Release: 9004392
Discogs-Master: 123456
Disc: 1/2
```

In repair mode, albums without an `info.txt` also get a basic one built from their tags.

## Install the binary system-wide

```bash
sudo bash scripts/install-bins.sh
```
