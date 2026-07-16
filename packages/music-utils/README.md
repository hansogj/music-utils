[![example workflow](https://github.com/hansogj/music-utils/actions/workflows/build.yml/badge.svg)](https://github.com/hansogj/music-utils/actions/workflows/build.yml/badge.svg)

# @hansogj/music-utils

TypeScript CLI toolkit for managing FLAC and MP3 music collections. Handles CD ripping, tag reading/writing, Discogs metadata lookup, cover art fetching, and folder-structure normalization.

# External dependencies

The CLIs shell out to a handful of system tools. Install them first:

```bash
sudo apt install \
  id3v2 \
  flac \
  cdparanoia \
  ffmpeg \
  file
```

`ffmpeg` provides `ffprobe`; `flac` provides `metaflac`; `file` is used to detect audio-file type.

# Installation

## From npm

```
npm install -g @hansogj/music-utils
```

This makes all `music-utils-*` commands available in your terminal.

## From source

```
pnpm install
pnpm --filter @hansogj/music-utils run build
pnpm --filter @hansogj/music-utils link --global
```

# Environment

Every command that talks to Discogs needs a personal access token. Put it in a `.env` at the project root (source install) or export it in your shell (npm install):

```
DISCOGS_TOKEN="###YOUR_DISCOGS_TOKEN###"
```

# Configuration

Folder naming, track filenames, and the library root are configurable via a JSON file. Precedence (first match wins per key):

1. `./music-utils.config.json` in the current directory (project-local, e.g. per library)
2. `~/.music-utilsrc.json` in your home directory (user-global)
3. Built-in defaults

Every key is optional; anything you omit falls back to the default. Types and ranges are checked at load time — a bad value (e.g. `flac.compressionLevel: "banana"` or `disc.separator: "a/b"`) throws a `ConfigError` naming the offending path so you can fix it, rather than silently corrupting a rip.

## Schema

```json
{
  "libraryRoot": "~/Music",
  "tracksFile": "tracks.txt",
  "patterns": {
    "artistFolder": "{artist}",
    "albumFolder": "{year} {album}{discSuffix}{auxSuffix}",
    "track": "{trackNo}{artistPrefix}{title}",
    "trackMultiDisc": "d{disc}t{trackNo}.{artistPrefix}{title}",
    "artistPrefix": " {artist} - ",
    "discSuffix": " (Disc {disc}{discSep}{total})",
    "auxSuffix": " [{aux}]"
  },
  "artist": {
    "sortArticles": true,
    "articles": ["the", "los", "il", "la", "el", "le"]
  },
  "cover": {
    "filename": "cover.jpg"
  },
  "disc": {
    "separator": "∕"
  },
  "flac": {
    "compressionLevel": 5
  }
}
```

### `libraryRoot`

Base directory for `music-utils-rip`. When set (tildes are expanded), rips land here regardless of your current working directory — you can run `music-utils-rip -r <id>` from anywhere. When unset, rips land relative to `process.cwd()`.

### `tracksFile`

Default path used by `music-utils-tracks-tag` when `-f` is not supplied. Relative paths are resolved against `process.cwd()`; an absolute path is used as-is. Precedence: CLI `-f` > this key > default `"tracks.txt"`.

### `patterns.*`

Templates use `{token}` substitution. Available tokens: `{artist}`, `{album}`, `{year}`, `{disc}`, `{total}`, `{trackNo}`, `{title}`, `{aux}`, `{discSep}`, `{discSuffix}`, `{auxSuffix}`, `{artistPrefix}`. Missing tokens resolve to empty and surrounding whitespace collapses.

- `artistFolder` / `albumFolder` — the two path segments `music-utils-*` writes into.
- `track` / `trackMultiDisc` — filename (without extension) for single-disc vs multi-disc releases.
- `artistPrefix` — inserted before `{title}` when the release has an artist; renders to `' '` otherwise.
- `discSuffix` — appended to `albumFolder` when `noOfDiscs > 1`. Includes a `{discSep}` token which resolves to `disc.separator` at render time.
- `auxSuffix` — appended when the album has aux info (e.g. `[remaster]`).

### `artist.sortArticles` / `artist.articles`

When `true`, definite articles listed in `articles` move to the end during folder naming: `"The Beatles" → "Beatles, The"`. Set `false` to keep the article in place, or replace `articles` with your own list.

### `cover.filename`

Filename `music-utils-rip` and `music-utils-cover-photo` write for album art. Default `"cover.jpg"`. Change to `"folder.jpg"` for the Windows convention, or `"AlbumArt.jpg"` if that's what your player expects.

### `disc.separator`

Character inserted between disc-number and total in multi-disc folder names, e.g. `Disc 1∕2`. Default is `∕` (U+2215 division slash). It **cannot be `/`** — filesystems reject that character in path segments. Common alternates: `-`, `_`, or a full-width `／`. Also used when sanitizing user-supplied strings that contain `/` (via `replaceDangers`).

Changing this after your library already contains multi-disc folders means old folders parse under the old separator and new folders use the new one — safest to pick a value at library setup and leave it alone.

### `flac.compressionLevel`

Passed to the `flac` CLI as `-<level>` during `music-utils-rip`'s WAV→FLAC step. Range `0` (fast/large) through `8` (slow/small). Default `5` matches the `flac` CLI's own default.

# Features

## rip

### Usage

```
$> music-utils-rip -r <releaseId> -d <disc-number?>
```

`<releaseId>` is the Discogs item id; `<disc-number>` is used when there is more than one disc. Creates a folder `Artist/YYYY Album Name` (under `libraryRoot` if configured, otherwise the current directory), rips the CD via `cdparanoia`, converts WAV to FLAC, renames files, sets tags, and fetches the cover photo — all based on info from Discogs.

## cover-photo

### Usage

```
Music/Artist/2020 Album $> music-utils-cover-photo --releaseId <id>
Music/Artist/2020 Album $> music-utils-cover-photo
```

Parses your current directory to extract artist and album info, then fetches a matching cover photo from Discogs and saves it as `cover.jpg`. The `--releaseId` option is more accurate; without it, info is deduced from the path.

## album-tag

### Usage

```
Music/Artist/YYYY Album $> music-utils-album-tag
Music/Artist $> music-utils-album-tag -a "YYYY Album"
```

Parses directory structure to extract artist/album info, extracts tags from each file (FLAC, MP3, or filename), merges metadata, rewrites tags, and renames the folder to the standardized structure:

- `Artist/YYYY Album name`
- `Artist/YYYY Album name [extended info]`
- `Artist/YYYY Album name (Disc 1∕2)`

## tracks-tag

### Usage

```
Music/Artist/2020 Album $> music-utils-tracks-tag -f /path/to/tracks.txt
Music/Artist/2020 Album $> music-utils-tracks-tag                          # uses config.tracksFile
```

Like _album-tag_ but reads track names from an external file (one title per line) instead of relying on tags already present. Path resolution:

1. `-f <file>` CLI flag (highest priority)
2. `tracksFile` from your config (`music-utils.config.json` / `~/.music-utilsrc.json`)
3. Default `tracks.txt` in the current working directory

Handy after `music-utils-rip`, which writes a `tracks.txt` for the album at rip time and then chdirs into the album folder — running `music-utils-tracks-tag` there with the default resolution just works.

## album-cover (cover + tag combo)

### Usage

```
Music/Artist/2020 Album $> music-utils-album-cover
```

Fetches album cover from Discogs then tags the album in one step.

## bulk-album-tag

### Usage

```
Music/Artist $> music-utils-bulk-album-tag
Music $> music-utils-bulk-album-tag /path/to/artist/
```

Tags all album subdirectories in the given folder (or current directory).

## bulk-cover-photo

### Usage

```
Music/Artist $> music-utils-bulk-cover-photo
```

Fetches cover photos for all subdirectories that don't already have a `.jpg` file.

## similarities

Fuzzy-matches artist directory names across two roots so you can spot duplicates when merging or comparing music libraries. Typical use: you kept a backup on one drive and a working library on another, and the same artist has drifted into `A Band` in one place and `Band, A` in the other. `similarities` surfaces those pairs.

It scans `-A` one level deep for artist directories and `-B` two levels deep (assuming `Artist/Album` layout), strips a configurable set of ignore-words from each name (definite articles, "and", "band", etc.), then compares via string similarity. Pairs scoring above `-T` are reported.

### Usage

```
$> music-utils-similarities -A /path/to/library-A/ -B /path/to/library-B/ -T 0.5 -Q
$> music-utils-similarities -A ./ -B /mnt/backup/Music/ -T 0.7 -f matches.json
```

- **`-A <path>`** / **`--dirA <path>`** base directory (artist folders directly under this)
- **`-B <path>`** / **`--dirB <path>`** comparison directory (searched two levels deep for `Artist/Album`)
- **`-T <0..1>`** / **`--threshold`** similarity threshold; higher is stricter (0.5 = loose, 0.8 = tight)
- **`-f <file>`** / **`--fileName`** optional; write results to `<file>` as JSON in addition to logging them
- **`-I <word>`** / **`--ignore <word>`** words to strip before comparing (repeatable); merged with the built-in list
- **`-Q`** / **`--quiet`** quiet mode; suppress timing/progress logs

## sync-tracks

### Usage

```
Music/Artist/2020 Album $> music-utils-sync-tracks
```

Renames audio files in the current album folder to reflect the tags already on them. Reads each file's tags, parses the folder path for artist/album/year context, then applies the configured `patterns.track` / `patterns.trackMultiDisc` templates to compute the target filename. The tags themselves are not rewritten — this is filename-only.

Useful when the tags are already correct (e.g. from another program) but the filenames don't match, or when you've changed your `patterns.*` config and want existing files to catch up.

## completion

Shell tab-completion for every `music-utils-*` command's flags (and file/directory completion for path-valued flags like `-f`, `-A`, `-B`).

### Install (bash)

Session-only:

```
source <(music-utils-completion bash)
```

Persistent (per-user, no root):

```
music-utils-completion bash > ~/.local/share/bash-completion/completions/music-utils
```

Now `music-utils-rip -<TAB>` shows `-r`, `--releaseId`, `-d`, `--disc`; `music-utils-similarities -A <TAB>` completes directories; and so on. Zsh support is on the backlog.
