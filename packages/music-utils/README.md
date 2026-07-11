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

Every key is optional; anything you omit falls back to the default.

## Schema

```json
{
  "libraryRoot": "~/Music",
  "patterns": {
    "artistFolder": "{artist}",
    "albumFolder": "{year} {album}{discSuffix}{auxSuffix}",
    "track": "{trackNo}{artistPrefix}{title}",
    "trackMultiDisc": "d{disc}t{trackNo}.{artistPrefix}{title}",
    "artistPrefix": " {artist} - ",
    "discSuffix": " (Disc {disc}∕{total})",
    "auxSuffix": " [{aux}]"
  },
  "artist": {
    "sortArticles": true,
    "articles": ["the", "los", "il", "la", "el", "le"]
  }
}
```

### `libraryRoot`

Base directory for `music-utils-rip`. When set (tildes are expanded), rips land here regardless of your current working directory — you can run `music-utils-rip -r <id>` from anywhere. When unset, rips land relative to `process.cwd()`.

### `patterns.*`

Templates use `{token}` substitution. Available tokens: `{artist}`, `{album}`, `{year}`, `{disc}`, `{total}`, `{trackNo}`, `{title}`, `{aux}`, `{discSuffix}`, `{auxSuffix}`, `{artistPrefix}`. Missing tokens resolve to empty and surrounding whitespace collapses.

- `artistFolder` / `albumFolder` — the two path segments `music-utils-*` writes into.
- `track` / `trackMultiDisc` — filename (without extension) for single-disc vs multi-disc releases.
- `artistPrefix` — inserted before `{title}` when the release has an artist; renders to `' '` otherwise.
- `discSuffix` — appended to `albumFolder` when `noOfDiscs > 1`. Note: the character between disc/total is `∕` (U+2215 division slash), not `/`, because filesystems reject `/` in path segments.
- `auxSuffix` — appended when the album has aux info (e.g. `[remaster]`).

### `artist.sortArticles` / `artist.articles`

When `true`, definite articles listed in `articles` move to the end during folder naming: `"The Beatles" → "Beatles, The"`. Set `false` to keep the article in place, or replace `articles` with your own list.

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
```

Like _album-tag_ but uses track names from the provided `tracks.txt` file.

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

Finds similar artist names across directories (e.g. `A Band` vs `Band, A`).

### Usage

```
$> music-utils-similarities -A /path/to/origin/ -B /path/to/comparator/ -T 0.5 -Q
```

- **-A** base directory
- **-B** comparing directory
- **-T** threshold of equality
- **-Q** quiet mode

## sync-tracks

### Usage

```
Music/Artist/2020 Album $> music-utils-sync-tracks
```

Synchronizes track filenames with parsed album metadata.
