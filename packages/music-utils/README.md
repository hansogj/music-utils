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

This installs the `music-utils` command (also available as the short alias `mu`). Every feature is a subcommand: run `music-utils help` for the list.

> Before 2.0 each feature was its own `music-utils-*` command (`music-utils-rip`, `music-utils-album-tag`, …). Those are gone; see [Features](#features) for the `music-utils` equivalents.

## From source

```
pnpm install
pnpm --filter @hansogj/music-utils run build
pnpm --filter @hansogj/music-utils link --global
```

# Environment

Every command that talks to Discogs needs a personal access token. Put it in `~/.config/music-utils/.env` (shared with `music-audit`; under `sudo` the invoking user's home is used) or export it in your shell:

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
    "sortArticles": false,
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

Base directory for `music-utils rip`. When set (tildes are expanded), rips land here regardless of your current working directory — you can run `music-utils rip -r <id>` from anywhere. When unset, rips land relative to `process.cwd()`.

### `tracksFile`

Default path used by `music-utils tag tracks` when `-f` is not supplied. Relative paths are resolved against `process.cwd()`; an absolute path is used as-is. Precedence: CLI `-f` > this key > default `"tracks.txt"`.

### `patterns.*`

Templates use `{token}` substitution. Available tokens: `{artist}`, `{album}`, `{year}`, `{disc}`, `{total}`, `{trackNo}`, `{title}`, `{aux}`, `{discSep}`, `{discSuffix}`, `{auxSuffix}`, `{artistPrefix}`. Missing tokens resolve to empty and surrounding whitespace collapses.

- `artistFolder` / `albumFolder` — the two path segments `music-utils rip` and `music-utils tag album` write into.
- `track` / `trackMultiDisc` — filename (without extension) for single-disc vs multi-disc releases.
- `artistPrefix` — inserted before `{title}` when the release has an artist; renders to `' '` otherwise.
- `discSuffix` — appended to `albumFolder` when `noOfDiscs > 1`. Includes a `{discSep}` token which resolves to `disc.separator` at render time.
- `auxSuffix` — appended when the album has aux info (e.g. `[remaster]`).

### `artist.sortArticles` / `artist.articles`

Off by default: artist folders keep the article (`The Beatles`). When `true`, definite articles listed in `articles` move to the end during folder naming: `"The Beatles" → "Beatles, The"`; replace `articles` with your own list if needed.

### `cover.filename`

Filename `music-utils rip` and `music-utils cover` write for album art. Default `"cover.jpg"`. Change to `"folder.jpg"` for the Windows convention, or `"AlbumArt.jpg"` if that's what your player expects.

### `disc.separator`

Character inserted between disc-number and total in multi-disc folder names, e.g. `Disc 1∕2`. Default is `∕` (U+2215 division slash). It **cannot be `/`** — filesystems reject that character in path segments. Common alternates: `-`, `_`, or a full-width `／`. Also used when sanitizing user-supplied strings that contain `/` (via `replaceDangers`).

Changing this after your library already contains multi-disc folders means old folders parse under the old separator and new folders use the new one — safest to pick a value at library setup and leave it alone.

### `flac.compressionLevel`

Passed to the `flac` CLI as `-<level>` during `music-utils rip`'s WAV→FLAC step. Range `0` (fast/large) through `8` (slow/small). Default `5` matches the `flac` CLI's own default.

# Features

| Command | What it does |
| --- | --- |
| `music-utils rip` | Rip a CD and tag it from Discogs |
| `music-utils tag album` | Tag an album from its folder structure and existing tags |
| `music-utils tag tracks` | Tag an album from a tracklist file |
| `music-utils tag bulk` | Tag every album folder under a directory |
| `music-utils cover` | Fetch the album cover from Discogs |
| `music-utils cover album` | Fetch the cover, then tag the album |
| `music-utils cover bulk` | Fetch covers for every album folder that has none |
| `music-utils sync` | Rename track files to match their tags |
| `music-utils similarities` | Find near-duplicate artist names across two libraries |
| `music-utils audit` | Audit the library (forwards to `music-audit`, if installed) |
| `music-utils completion bash` | Print the bash completion script |

`-a DIR` / `--album DIR` runs a command on another album folder instead of the current directory.

## rip

```
$> music-utils rip -r <releaseId> -d <disc-number?>
```

`<releaseId>` is the Discogs release ID (`4565937`, `r4565937`, or a release URL) or a master ID (`m1439`, or a master URL), which resolves to the master's main release; `<disc-number>` is used when there is more than one disc. Creates a folder `Artist/YYYY Album Name` (under `libraryRoot` if configured, otherwise the current directory), rips the CD via `cdparanoia`, converts WAV to FLAC, renames files, sets tags, and fetches the cover photo — all based on info from Discogs. Year and album title come from the Discogs master, so a reissue is filed under its original year.

## cover

```
Music/Artist/2020 Album $> music-utils cover -r <releaseId>
Music/Artist/2020 Album $> music-utils cover
```

Parses your current directory to extract artist and album info, then fetches a matching cover photo from Discogs and saves it as `cover.jpg`. The `-r` / `--releaseId` option is more accurate; without it, info is deduced from the path. `-Q` / `--quiet` suppresses progress output.

## tag album

```
Music/Artist/YYYY Album $> music-utils tag album
Music/Artist $> music-utils tag album -a "YYYY Album"
```

Parses directory structure to extract artist/album info, extracts tags from each file (FLAC, MP3, or filename), merges metadata, rewrites tags, and renames the folder to the standardized structure:

- `Artist/YYYY Album name`
- `Artist/YYYY Album name [extended info]`
- `Artist/YYYY Album name (Disc 1∕2)`

## tag tracks

```
Music/Artist/2020 Album $> music-utils tag tracks -f /path/to/tracks.txt
Music/Artist/2020 Album $> music-utils tag tracks                          # uses config.tracksFile
```

Like _tag album_ but reads track names from an external file (one title per line) instead of relying on tags already present. Path resolution:

1. `-f <file>` / `--fileName <file>` (highest priority)
2. `tracksFile` from your config (`music-utils.config.json` / `~/.music-utilsrc.json`)
3. Default `tracks.txt` in the current working directory

Handy after `music-utils rip`, which writes a `tracks.txt` for the album at rip time and then chdirs into the album folder — running `music-utils tag tracks` there with the default resolution just works.

## cover album (cover + tag combo)

```
Music/Artist/2020 Album $> music-utils cover album
```

Fetches album cover from Discogs then tags the album in one step.

## tag bulk

```
Music/Artist $> music-utils tag bulk
Music $> music-utils tag bulk /path/to/artist/
```

Tags all album subdirectories in the given folder (or current directory).

## cover bulk

```
Music/Artist $> music-utils cover bulk
```

Fetches cover photos for all subdirectories that don't already have a `.jpg` file.

## similarities

Fuzzy-matches artist directory names across two roots so you can spot duplicates when merging or comparing music libraries. Typical use: you kept a backup on one drive and a working library on another, and the same artist has drifted into `A Band` in one place and `Band, A` in the other. `similarities` surfaces those pairs.

It scans `-A` one level deep for artist directories and `-B` two levels deep (assuming `Artist/Album` layout), strips a configurable set of ignore-words from each name (definite articles, "and", "band", etc.), then compares via string similarity. Pairs scoring above `-T` are reported.

```
$> music-utils similarities -A /path/to/library-A/ -B /path/to/library-B/ -T 0.5 -Q
$> music-utils similarities -A ./ -B /mnt/backup/Music/ -T 0.7 -f matches.json
```

- **`-A <path>`** / **`--dirA <path>`** base directory (artist folders directly under this)
- **`-B <path>`** / **`--dirB <path>`** comparison directory (searched two levels deep for `Artist/Album`)
- **`-T <0..1>`** / **`--threshold`** similarity threshold; higher is stricter (0.5 = loose, 0.8 = tight)
- **`-f <file>`** / **`--fileName`** optional; write results to `<file>` as JSON in addition to logging them
- **`-I <word>`** / **`--ignore <word>`** words to strip before comparing (repeatable); merged with the built-in list
- **`-Q`** / **`--quiet`** quiet mode; suppress timing/progress logs

## sync

```
Music/Artist/2020 Album $> music-utils sync
```

Renames audio files in the current album folder to reflect the tags already on them. Reads each file's tags, parses the folder path for artist/album/year context, then applies the configured `patterns.track` / `patterns.trackMultiDisc` templates to compute the target filename. The tags themselves are not rewritten — this is filename-only.

Useful when the tags are already correct (e.g. from another program) but the filenames don't match, or when you've changed your `patterns.*` config and want existing files to catch up.

## completion

Bash tab-completion for `music-utils` / `mu`: subcommands, flags, and file/directory completion for path-valued flags (`-a`, `-f`, `-A`, `-B`, `--root`).

Session-only:

```
source <(music-utils completion bash)
```

Persistent (per-user, no root). bash-completion loads a file named after the command being completed, so install it under both names:

```
music-utils completion bash > ~/.local/share/bash-completion/completions/music-utils
ln -sf music-utils ~/.local/share/bash-completion/completions/mu
```

Now `music-utils <TAB>` lists the commands, `music-utils tag <TAB>` the subcommands, and `music-utils similarities -A <TAB>` completes directories. Zsh support is on the backlog.
