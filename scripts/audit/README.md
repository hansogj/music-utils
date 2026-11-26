# music-audit

Private, unpublished CLI for auditing and interactively repairing a local FLAC/MP3 music library. Not part of the published npm packages.

## What it checks

| Check                                         | Severity | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder starts with 4-digit year               | SEVERE   | e.g. `1984 No Return`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Correct disc separator (`∕` U+2215)           | SEVERE   | e.g. `(Disc 1∕2)`; a lower-case `(disc 1∕2)` too. Repair renames to `(Disc n∕m)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Auxiliary info in `[]` not `{}`               | SEVERE   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Artist under correct `[A-Z]` letter dir       | SEVERE   | Articles stripped for sorting. Repair moves the album, not the whole artist folder, to the artist folder under the right letter: one that exists there is joined (whatever its case); the old folder goes, cover and all, with its last album                                                                                                                                                                                                                                                                                                                                                                                           |
| Names an SMB share can hold                   | HIGH     | No `" * : < > ? \ \|` in the artist folder, the album folder or file names, and no trailing space; album folders and file names no trailing `.` either (artist names keep theirs: `I.P.A.`). A Synology share stores such names with private-use characters, so they have two spellings (over SMB and on the NAS); those characters are reported too. `UNSAFE_ARTIST_NAME`, `UNSAFE_FOLDER_NAME`, `UNSAFE_FILE_NAME`. Repair renames to the name music-audit's renames make (`2003 Pirates Of The Caribbean - The Curse Of The Black Pearl`, `1961 Dexter Calling`, `Richard Groove Holmes`: the album moves, the tags keep their name) |
| All required tags present                     | HIGH     | TITLE, ARTIST, ALBUM, DATE, TRACKNUMBER                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Filename matches TITLE tag                    | MODERATE |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Duplicate track names                         | MODERATE | The same title twice, qualifier included: `Sweet Dreams` and `Sweet Dreams (Original Mix)` are different tracks. The same title on tracks of their own (`06 - Visan I Sommaren`, `12 - Visan I Sommaren`: TRACKNUMBER/DISCNUMBER, else the number in the file name) is fine; a copy without a number, or two on one number, is a duplicate; the message names the likely extra copy (no number in its name, then no TITLE tag)                                                                                                                                                                                                          |
| Artist folder is the artist tag               | MODERATE | At least one track's album artist (ALBUMARTIST, else ARTIST) is the artist folder's name, its brackets included (`Dionysos [Canada]`): players group by the tag. Compared as written, case aside: `Ytre Suløens` and `Ytre Suloens` differ. `Various Artists` is skipped. A tag that is the folder's name inverted (`Doors, the`, `Cow, Henry`) is its own issue. Repair writes the folder's name to ALBUMARTIST, and to ARTIST where that is empty or the same name (a guest keeps its own), or moves the album to an artist folder named by the tags. Many differences are fine (a leader's folder with the band's album): skip those |
| Disc number not above the disc count          | MODERATE | `DISC_ABOVE_TOTAL`: DISCNUMBER `2/1` (the disc from an old `d2t01` file name). Repair writes the number Discogs tagging would: the folder's `n/m` in a `(Disc n∕m)` folder, else `1/1` (`1/2`, `2/2` for a set kept in one folder)                                                                                                                                                                                                                                                                                                                                                                                                      |
| The discs of a set share one release          | MODERATE | `MIXED_SET_RELEASE`: `(Disc n∕m)` folders of one album tagged from different Discogs releases (`info.txt`, else the tags). The release most discs have is the set's (on a tie, the lowest disc's); the others are reported. Repair tags the disc from Discogs, offering the set's release first                                                                                                                                                                                                                                                                                                                                         |
| MP3 has a Discogs master ID but no release ID | HIGH     | Left by repairs with music-audit 81963c0/43bd432. Repair restores the release ID from the Discogs URL comment or `info.txt`, and rewrites the comment as one full URL, or retags the album from a release you choose                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Album has `cover.jpg` or `folder.jpg`         | MODERATE | Either one is the cover, any case (`Cover.JPG`). The message names other images in the folder (`front.jpg`, `cover.png`). Each cover file there must be a readable image (some are saved web pages)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Album has one cover file: `cover.jpg`         | MODERATE | `FOLDER_JPG`: a `folder.jpg` instead of `cover.jpg`, or next to the same image as `cover.jpg`. `COVER_FILES_DIFFER`: the two are different images. A repair run tidies the first kind away unasked before it checks the album: a `folder.jpg` on its own becomes `cover.jpg`, one that is the same image is removed (both noted in `info.txt`). For two different images it asks which one to keep as `cover.jpg`, the Discogs cover first                                                                                                                                                                                              |
| The cover is the Discogs cover                | MODERATE | `cover.jpg` (else `folder.jpg`), for albums with a Discogs release ID (tags, the comment URL or `info.txt`): compared with the release's front cover, then the master's; not while `cover.jpg` and `folder.jpg` differ. Images are compared by a perceptual hash (ImageMagick `magick`), so a 1400px scan with a white margin matches the 600px Discogs image; another cover doesn't. Needs Discogs; hashes are cached in `~/.cache/music-audit/cover-hashes.json`                                                                                                                                                                      |
| Artist folder has `cover.jpg` or `folder.jpg` | MODERATE | A readable one. Any of the artist's album covers will do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Year is the original release year             | HIGH     | **Opt-in** (`--check-years`, or `MUSIC_AUDIT_CHECK_YEARS=true` in `~/.config/music-utils/.env`). Albums tagged with a Discogs release ID: folder/DATE year must match the master's year, not a reissue's (e.g. a 1989 reissue of _In Rock_ → `1970`). Needs Discogs; results are cached in `~/.cache/music-audit/original-years.json`                                                                                                                                                                                                                                                                                                   |

## Usage

```bash
# Audit only (no Discogs lookups): no token, and answer c at the prompt
DISCOGS_TOKEN= pnpm --filter @hansogj/music-audit run audit -- --root /mnt/music

# Audit with Discogs suggestions (top 5 releases, scored against local track names)
pnpm --filter @hansogj/music-audit run audit -- --root /mnt/music --token YOUR_TOKEN

# Point at a single album folder
music-audit --root /mnt/music/Z/ZAO/1976\ Kawana --token YOUR_TOKEN

# Interactive repair: albums without a Discogs release ID are tagged from Discogs first,
# then every album's issues one by one
sudo music-audit --repair --root /mnt/music --token YOUR_TOKEN

# Re-tag everything from Discogs, also albums tagged from a release already
sudo music-audit --retag --root /mnt/music --token YOUR_TOKEN

# Serve HTML report in browser
music-audit --ui --root /mnt/music --token YOUR_TOKEN
```

### What is sent to Discogs

Without a token nothing leaves your machine: music-audit asks whether to go on offline (`c`) or quit (`q`, which says how to add a token). A run without a terminal to ask on (a script, CI) goes on offline. With a token, requests go to `api.discogs.com`:

- artist and album title (from the folder name) for albums with issues, and in repair mode for albums without a Discogs release ID — every album with `--retag`
- with the year check on: the Discogs release ID from the tags of every tagged album (once; then cached)
- for the cover check: the release ID of every album with a `cover.jpg` or `folder.jpg` and a release ID (once; then cached), and its master ID when the release's cover doesn't match. Cover images come from `i.discogs.com`, which doesn't count against the rate limit

File names, paths and track titles are never sent; tracklist matching happens locally.

Discogs allows 60 requests a minute with a token (25 without). music-audit keeps under that limit by itself: when the budget is used up, the scan waits for it to free up again. A release you ask for at a repair prompt goes ahead of the scan. If Discogs still answers "429 Too Many Requests" (for example when the same token is in use on another machine), all requests pause together, for 5s, then 10, 20, 40 and 60s, and one line says so.

To turn the year check on permanently, add this to `~/.config/music-utils/.env` (override per run with `--no-check-years`):

```
MUSIC_AUDIT_CHECK_YEARS=true
```

`DISCOGS_TOKEN` can also be set as an environment variable or in `~/.config/music-utils/.env` (shared with the music-utils CLIs; under `sudo` the invoking user's home is used) instead of `--token`.

### Your Discogs collection (optional)

With your collection at hand, music-audit suggests the releases you own (see **Your Discogs collection** under repair mode below). No setting is needed:

1. On discogs.com: your collection → Export → download the CSV.
2. Put it in `~/.config/music-utils/` with the name Discogs gives it, for example `~/.config/music-utils/hansogj-collection-20261123-0623.csv`.

music-audit uses the newest `*-collection-*.csv` in that folder, so when your collection grows, download a new export into the same folder; older ones may stay or go. Nothing is sent anywhere: the file is only read.

Only to keep the export somewhere else, name it in `~/.config/music-utils/.env`:

```
DISCOGS_COLLECTION_CSV=/path/to/my-collection.csv
```

Without an export, suggestions work as before.

## Flags

| Flag              | Description                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `--root=<path>`   | Root of music library (default: cwd)                                                           |
| `--token=<token>` | Discogs personal access token                                                                  |
| `--no-covers`     | Skip the cover checks                                                                          |
| `--repair`        | Interactive repair mode: Discogs first for albums without a release ID, then the issues        |
| `--retag`         | Like `--repair`, and every album is offered Discogs tagging, also one with a release ID        |
| `--ui`            | Serve HTML report at `http://localhost:7171`                                                   |
| `--json`          | Raw JSON output (incompatible with `--repair`/`--ui`)                                          |
| `--log[=<path>]`  | Append JSON Lines audit log (default: `~/.local/share/music-audit/YYYY.MM.dd.HH.mm-audit.log`) |
| `--version`, `-v` | The commit this checkout runs, its branch and date: `a94e58a (main, 2026-11-25)`               |

Without `--repair`/`--retag` the audit only reads: nothing in the library is written.

## Repair mode

`--repair` (or `--retag`, which implies repair) walks album-by-album through issues and offers automated fixes.

**Discogs first.** An album with no Discogs release ID (no `DISCOGS_RELEASE_ID` tag, Discogs URL comment or `Discogs-Release:` line in `info.txt`) opens with tagging, whatever its issues, so titles and file names come from the release instead of being patched from each other:

```
  No Discogs release ID yet — tag from Discogs first:
  [1] Tag from Discogs release ID (suggested: 4565937 — Sacred Baboon, CD, 92% match)
  [2] Paste the tracklist (one line per track; artist, album and year from the folder)
  [f] Fix the 3 issue(s) one by one   [s] Skip album   [o] Start album over   [q] Quit repair
```

The suggestion is the search hit whose track titles best match the files. A digital release (CD, CDr, SACD, DVD-Audio or a download, `File`) comes before vinyl when its match is at most 5 points lower: the library holds digital versions, and an LP's sides, track splits or missing bonus tracks fit them less well. When none of the first three hits is digital, the first one among the top five is compared too. The album table and the release list show each hit's format, and mark the suggested hit with ★.

**Your Discogs collection.** Export it from Discogs (Collection → Export) and put the CSV in `~/.config/music-utils/` with its own name, no setting needed (see [Your Discogs collection](#your-discogs-collection-optional) above): music-audit reads the newest `*-collection-*.csv` there once per run, without any Discogs request. Only its digital releases count (CD, HDCD, CDr, SACD, DVD-Audio, File), from every folder. A search hit you own is marked `· in collection`; an owned release the search didn't find is added, found by artist and title (Discogs' `(3)` and the folder's brackets left out), up to three owned releases per album. An owned release goes first when its match is at most 15 points below the best one you don't own, and is suggested. Export the collection again when it grows; without the file nothing changes.

When the Discogs search finds nothing, `[1]` (Enter) still takes a release ID, one you look up yourself, and `[2]` pastes the tracklist. After tagging the album is scanned again and the issues still left are shown one by one; `[f]` goes straight to them (with today's fixes, such as renaming a file to match its tag), and `[s]` skips the album (with the bracket question below). An album tagged from a release already isn't fetched again: its tags and `info.txt` are trusted. With `--retag` every album gets this step, the album's own release ID suggested.

**When the track count differs.** A release with more or fewer tracks than the folder asks `Continue anyway? [y] tag anyway  [v] show diff  [d] deeper search  [N] skip`. `[v]` shows the files and the release side by side, as they would be paired: `✓` same title, `~` close, `✗` different, `+` a release track without a file, `−` a file without a track; then the question comes again. `[d]` searches the artist's Discogs discography (their own releases, not appearances; up to 60, those nearest the folder's year first, about a minute; Esc stops and shows what's found so far) for releases holding these tracks, whatever they are called: most of the folder's titles found first, then the closest track count. For a disc folder, the titles of every disc folder of the set count. Pick one in the list and tagging starts over with it; Esc goes back to the question. A pasted tracklist gets `[v]` too.

**Pasting a tracklist.** Paste one line per track, then an empty line. Each line is a title, `01 - Title`, `1. Title`, `A1 Title` (vinyl, numbered in order), `1-03 Title` or `d1t03 Title` (disc 1, track 3), copied from a web page or typed; a duration at the end (`3:45`, `(3:45)`) is dropped, and so is an artist every line starts with. Numbers are used only when every line has one: in a list of titles, `99 Problems` stays whole. The files get TITLE, TRACKNUMBER and DISCNUMBER from the list, and ARTIST, ALBUMARTIST, ALBUM and DATE from the folder name. Before writing, every file is shown with its new title; then you can rename the files to `01 - Title`. `info.txt` gets the list (with durations) unless it holds more than the old tags (your notes, a rip log), and a Changeset line either way.

- **Folder renames** — year prefix, disc separator, bracket style, letter-dir moves
- **Discogs tagging** — fetches tracklist, writes TITLE, ARTIST, ALBUM, DATE, ORIGINALDATE (`TORY` for MP3), TRACKNUMBER, DISCNUMBER, GENRE, COMMENT (Discogs URL), DISCOGS_RELEASE_ID, DISCOGS_MASTER_ID (MP3: TXXX frames; in the `--json` report as `tags.discogsReleaseId` / `tags.discogsMasterId`); offers to rename files (`01 - Title.mp3`, also inside a `(Disc n∕m)` folder; `d2t01 - Title.mp3` only when one folder holds several discs) and folders (including the year) to match. DATE/ORIGINALDATE and ALBUM always come from the Discogs **master** (original year and title), not from the specific pressing; the pressing's year goes in `info.txt` as `Reissue:`
- **Original year** — sets DATE/ORIGINALDATE to the master year and renames the folder's year prefix
- **Old year in a bracket** — whenever a repair changes a folder's year, it asks what to do with the old one: `k` keeps the folder's year (no change), `[Enter]` changes it with no bracket, `l` → `[live 1978]`, `r` → `[rec. 1978]`, both added last, after the disc part and any brackets the folder has: `1992 Tourmato (Disc 1∕2) [FLAC] [live 1979]`. `c` puts the folder's brackets as they are (`[FLAC]`, or `[1978]` when it has none) in the input line to edit; what you enter replaces them (plain text becomes one bracket, an empty line removes them). Folder name only: the ALBUM tag gets no bracket. The other discs of a set get the same answer without asking
- **Extra copies** — when tagging from Discogs, a file without a track number whose title matches a release track that already has a file is an extra copy: it is not tagged, and the track total stays the release's
- **One artist name** — when tagging from Discogs, the artist folder, the ARTIST/ALBUMARTIST tags and the `info.txt` header always get the same name (players such as DS Audio group by the tag). When Discogs' first credited artist, the folder and the tags don't all agree, you choose before anything is written:

  ```
    Artist names differ:
      Discogs : "David Holland Quartet"  (credits: "David Holland Quartet - Dave Holland, Sam Rivers, …")
      folder  : "Dave Holland Quartet"
      tags    : "Dave Holland"
    One name for the artist folder, the ARTIST/ALBUMARTIST tags and info.txt:
      [Enter] Discogs: "David Holland Quartet"
      [k]     keep the folder's: "Dave Holland Quartet"
      [a]     all credits: "David Holland Quartet - Dave Holland, Sam Rivers, …"
      [t]     type a name
      [o]     start album over
  ```

  `[a]` is offered when Discogs credits several artists (up to 3, and 60 characters at most: a longer name is no use as a folder), joined as Discogs shows them, except that a `/` between two credits becomes `, ` (`Patrick Woodroffe, Dave Greenslade`), the same in folder, tags and `info.txt`. `[t]` types a name, starting from Discogs'. Names that differ only in punctuation or a leading article (folder `Don Rendell - Ian Carr Quintet`, Discogs `The Don Rendell / Ian Carr Quintet`) are the same artist: the folder's name is kept and not asked about. A `/` inside a chosen name stays in the tags and becomes `-` in the folder (`AC/DC` → `AC - DC`); the artist check takes the one for the other. The artist folder then follows the choice without another question; the other disc folders of a set get the same answer. The folder's own brackets go to the tags too (`Dionysos [Canada]`), so same-named artists stay apart in a player as they do in the folders

- **Folder/artist rename** — detects when Discogs artist or album title differs from local folder names. The album title and the year are asked apart: `Discogs album name differs from local folder: "Dopo Il Buio" → "Dopo Il Buio La Luce" [Y/n]`, then the year question below (`k` keeps the folder's year), so either can change without the other. The artist folder follows the chosen artist unasked. When the artist differs, only this album moves into the new artist folder (created, or joined when it exists): the old artist folder may hold other albums credited to the old name, and they stay. When it has no albums left, its other files (`cover.jpg`) follow and the empty folder is removed (NAS metadata such as `@eaDir` doesn't count). The artist folder's own brackets (`Dionysos [Canada]`, telling same-named artists apart where Discogs says `Dionysos (3)`) aren't compared and are kept in a new artist name. Folder and file names get the title as an SMB share can hold it: `/`, `\` and `:` become `-`, `* ? " < > |` are dropped, and an album or track title loses trailing dots (`Pirates Of The Caribbean: The Curse Of The Black Pearl` → `2003 Pirates Of The Caribbean - The Curse Of The Black Pearl`, `Dexter Calling . . .` → `1961 Dexter Calling`; artist names keep theirs: `I.P.A.`); the tags keep Discogs' spelling. A difference in case only (`Speed of Love` / `Speed Of Love`) isn't offered as an album rename, and a case-only rename works on SMB shares
- **Name/tag sync** — rename file to match tag, or update tag to match filename
- **Artist tags** — `ARTIST_TAG_INVERTED` (`Doors, the` in `The Doors`) and `ARTIST_FOLDER_MISMATCH`: (a mismatch, the default) move the album to the tags' artist folder, or write the folder's name to the artist tags (with music-utils' `artist.sortArticles: true` in `./music-utils.config.json` or `~/.music-utilsrc.json`, the article last: `Beatles, The` in `The Beatles`, as `music-utils rip` / `tag album` write it; a plain `The Beatles` tag is then the issue, and Discogs and paste tagging write the sorted name too). A moved album goes under its letter (`/` in the name becomes `-`, as above). Not shown while an artist folder rename from Discogs tagging waits to run
- **Covers** — an album folder keeps one cover file, `cover.jpg`: a `folder.jpg` on its own is renamed to it and one that is the same image is removed, unasked, when the repair scans the album; for two different images you choose which one stays (as `cover.jpg`, the other is removed). A cover that is not the Discogs cover is replaced under its own name with the front cover of the album's master (first, the Enter choice: the original album's cover), of its release, or of a release or master ID you enter (`r123`, `m456`, a URL), up to 600px (Discogs' size). A broken one gives way to the folder's other cover file when that one is good (removed, or the good `folder.jpg` renamed to `cover.jpg`). No cover at all: download one as `cover.jpg`, or copy another image in the folder (one that is the Discogs cover is offered first). A disc folder of a set (`(Disc 2∕3)`) without a cover gets another disc folder's `cover.jpg` unasked, when that is the Discogs cover of this disc's release (else of the set's); one that isn't, or can't be told (no Discogs, no release ID), is offered in the menu instead: first, or last when it isn't the Discogs cover. The change is noted in `info.txt`. An artist folder without a cover gets a copy of this album's cover, or of another of the artist's albums'. The terminal can't show the images: when in doubt, look in the folder, and skip (`s`) to keep yours

Each album opens with a table: artist, album, year and disc from the folder name, how many tracks have tags, the audio formats in the folder with their quality (`FLAC 16/44.1`, `MP3 320 kbps`, `MP3 VBR ~245 kbps`; when the tracks differ, each quality with its track numbers: `FLAC 16/44.1 [1–11] · 24/96 [12]`, `FLAC 16/44.1 [1–5] · MP3 320 kbps [6, 7]`; formats music-audit doesn't read, such as WAV or M4A, are marked `(not checked)`: those files aren't checked or tagged) and the path.

The library is scanned in the background while you repair. Each album's header shows which album this is and how far the scan has come (`Album 3 of 17 so far · Scan ▕████░░░░▏ 120/340  35%`; the count of albums to repair grows while the scan finds more, and loses "so far" once it's done: `Album 18 of 41 · Scan done: 340 albums`), and when you have handled every album found so far, a live bar runs until the next one turns up. Report mode shows the same bar while it scans.

After each fix the album is scanned again, so the next issue shown matches the files as they are now: Discogs tagging often solves a name/tag mismatch, and that issue is then not shown at all. When you agree to rename the album or artist folder, the rename waits until the album's other fixes are done.

### Prompt keys

| Key     | Where                   | Does                                                                                                     |
| ------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Enter   | issue menu              | the first action, `[1]`                                                                                  |
| `1`–`9` | issue menu              | that action                                                                                              |
| `d`     | issue menu              | tag the whole album from a Discogs release you choose                                                    |
| `f`     | Discogs first           | go on to the album's issues one by one, without tagging                                                  |
| `s`     | Discogs first           | skip the album (offers a bracket, below)                                                                 |
| `l`     | issue menu              | list the album's files                                                                                   |
| `s`     | issue menu              | skip this issue; the first skip in an album offers to add a bracket to its folder name (below)           |
| `o`     | any prompt              | start this album over (below)                                                                            |
| `q`     | any prompt              | quit repair, after `Quit repair? [Y/n]` (`n` goes back to the prompt); also Ctrl+C (twice quits at once) |
| `b`     | release ID prompt       | browse the search results; Esc goes back to the issue menu                                               |
| `n`     | disc pairing            | start the disc at another release track                                                                  |
| `r`     | after an album's issues | go through the ones not fixed again (Enter goes on to the next album)                                    |

**A bracket after a skip.** Skipping often means Discogs doesn't know the album, for instance a bootleg. The first time you skip an issue in an album (also the album, at the Discogs first step), you can note that in the folder name:

```
  Add to the folder name (e.g. bootleg)? Edit the brackets; Enter leaves them.
    Brackets: bootleg
  → folder becomes "1978 Live in Paris [bootleg]" after this album's other fixes
```

The input starts with the brackets the folder has (`[FLAC]`), to edit or add to: plain text becomes a bracket (`[FLAC] bootleg` → `[FLAC] [bootleg]`), and an empty line removes them all. Enter leaves the name as it is. The rename runs last, with a Discogs rename if there is one, and is noted in `info.txt`.

Regret a choice? Answer `o` at any prompt (the menus list it as `[o] Start album over`; yes/no and typed-in prompts take it too) to go back to the album's opening table: the album is scanned again and its issues shown from the top. A folder rename you agreed to but that hasn't run yet is dropped; tags and file renames already written stay (tag again from Discogs to overwrite them).

Done with an album? When every issue is fixed, the next album follows without a prompt; with issues left, `[Enter] Next album   [r] Retry` asks once. To stop, answer `q` (or press Ctrl+C) at any prompt and confirm: a folder rename you agreed to for the album runs first, and the session summary follows. Ctrl+C while no prompt waits (a Discogs fetch, the scan) ends the run at once.

**A rename onto a folder that is there already.** An album rename (Discogs, year, disc separator, brackets, unsafe name) or a move into another artist folder can meet a folder of that name. music-audit compares the two (Discogs release and master, from `info.txt` or the tags, track count, size) and asks:

```
  ⚠ "1999 Essential Rarities" is there already:
             this album                  the existing one
    Release  r6285267                    r18180730
    Master   m128480                     m128480
    Tracks   15                          15
    Size     612 MB                      610 MB
  The same album, it seems.
  [1] Keep "1999 Essential Rarities"; set this album aside in _duplicates/D/The Doors/1999 The Complete …
  [2] Replace it: "1999 Essential Rarities" is set aside, this album takes its name
  [3] Add a bracket to this album's name, to tell them apart
  [s] Leave both as they are   [o] Start album over
```

Enter takes `[1]` when the two are the same album (one master, or one release, and as many tracks), else `[3]`. Nothing is deleted: a folder set aside goes to `_duplicates/` at the library root (next to the letter folders), under its own path, with a note in its `info.txt`; the scan skips `_duplicates`, and you empty it when sure. An album set aside ends its repair; `[s]` leaves the rename undone, as before.

### Choosing the Discogs release

Albums without a release ID are tagged from Discogs first (above). In an issue menu, Discogs tagging is offered for missing tags and for a missing release ID; on any other issue, press `d` to tag the whole album from a release of your choice.

Release IDs are accepted as plain numbers (`4565937`), `r4565937`, `[r4565937]`, or full Discogs URLs. Master IDs (`m1439`, `[m1439]`, master URLs) are accepted too and resolve to the master's main release (for a disc folder, see below). For an edition with bonus tracks enter that edition's release ID: the tracks get its tracklist and release ID, and still get the master ID and the master's year.

**Disc folders of one album.** When another disc folder of the album was tagged from a release already, that one is offered first:

```
    Use the same release ID [r8270054] as Disc 1? [Y/n]
```

Enter or `y` takes it; `n` goes on to the release ID prompt below, where it isn't suggested again. After a yes, when Disc 1's brackets differ from this folder's, you choose which to keep:

```
  Brackets differ from Disc 1's:
    [Enter] keep         → 1973 Yessongs (Disc 2∕2) [FLAC]
    d  as Disc 1         → 1973 Yessongs (Disc 2∕2) [bootleg]
    c  type new
```

`c` opens the brackets to edit, as after a skip. The same choice replaces the bracket question at the first skip in a disc folder whose brackets differ from the other discs'. The other disc folders are found even when their brackets differ (`… (Disc 1∕2) [bootleg]`); where two folders could be the same disc (`[Paris]` and `[London]`), only the one with this folder's brackets counts.

Enter at the release ID prompt takes the suggested ID, in this order:

1. the release the album is already tagged with, or the one in its Discogs comment or `info.txt`
2. for a disc folder, the release the album's other disc folders were tagged from (unless you said no to it)
3. the best search hit (`b` opens all search results)

**Albums split into disc folders** (`1973 Yessongs (Disc 1∕2)`, `… (Disc 2∕2)`): each folder is tagged from its own part of the release, numbered per disc (TRACKNUMBER `n/7`, DISCNUMBER `2/2`).

- Where the release numbers its discs (`1-1`/`2-1`, or numbering that starts again at 1), that disc's tracks are used as listed.
- Where it doesn't (vinyl sides `A1`…`F2`, `1`…`15` straight through), disc _n_ is placed after the tracks of the other disc folders, checked against your titles; without the other folders, by titles alone. The track-by-track pairing is shown first: Enter accepts it, `n` starts the disc at another release track. If neither titles nor other folders tell, you're asked for the start track.
- A master ID entered for a disc folder resolves to a CD version with that many discs (and, preferably, this disc's track count) instead of the master's main release, which is often the original vinyl.
- Once one disc folder is tagged, the others suggest the same release.
- Discogs "index" entries (a suite listed with its parts): parts with track numbers of their own are tracks of their own, titled `Suite; part` (Dice's _War; a) Ouverture_); parts with lettered positions (_And You And I_, `1-5.a`) make one track. When that doesn't match the number of files, the other reading (every suite split, or every suite one track) is used if it fits.
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
pnpm --filter @hansogj/music-audit run lint        # ESLint (typescript-eslint, import order)
pnpm --filter @hansogj/music-audit run format      # Prettier (format:check to check only)
pnpm --filter @hansogj/music-audit run precommit   # lint + format check + tests with coverage (80%) + build
```

- Tests answer prompts through `setPrompt()` and use fake audio files that hold their tags as JSON (`repair.test.ts`), so they need neither `metaflac`/`id3v2` nor real audio. Audio files are gitignored: a test must create every file it uses.
- `tag-write.test.ts` runs only where `id3v2` is installed (CI installs it, #149); the cover hash tests only where `magick` (ImageMagick 7) is.
- Discogs is mocked; fixtures follow the real API shapes (e.g. the _Yessongs_ tracklists in `disc-split.test.ts`).
- ESLint (`eslint.config.mjs`: recommended + typescript-eslint + sorted imports) and Prettier (the root `.prettierrc`) are part of `precommit`; `npx eslint . --fix` sorts imports.
