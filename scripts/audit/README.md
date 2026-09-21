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

## Usage

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

`DISCOGS_TOKEN` can also be set as an environment variable or in a `.env` file instead of `--token`.

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
| `--log[=<path>]` | Append JSON Lines audit log to `.audit-log/MM.dd.HH.mm-audit.log` |

## Repair mode

`--repair` (or `--retag`, which implies repair) walks album-by-album through issues and offers automated fixes:

- **Folder renames** — year prefix, disc separator, bracket style, letter-dir moves
- **Discogs tagging** — fetches tracklist, writes TITLE, ARTIST, ALBUM, DATE, TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (Discogs URL), DISCOGS_RELEASE_ID; offers to rename files and folders to match
- **Folder/artist rename** — detects when Discogs artist or album title differs from local folder names
- **Name/tag sync** — rename file to match tag, or update tag to match filename

Release IDs are accepted as plain numbers (`4565937`), `r4565937`, `[r4565937]`, or full Discogs URLs.

Each session writes two logs to `.audit-log/`:

- `MM.dd.HH.mm-audit.log` — JSON Lines audit log (albums scanned, issues found, summary)
- `MM.dd.HH.mm-repair.log` — JSON Lines repair log (every fix attempt, crash-safe)

After Discogs tagging, an `info.txt` is written to the album folder with artist, tracklist, personnel, and durations.

## Install the binary system-wide

```bash
sudo bash scripts/install-bins.sh
```
