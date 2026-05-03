[![example workflow](https://github.com/hansogj/music-utils/actions/workflows/build.yml/badge.svg)](https://github.com/hansogj/music-utils/actions/workflows/build.yml/badge.svg)

# Dependencies

install following dependencies

```bash
sudo apt install \
id3v2 \
flac \
cdparanoia
```

# Installation

```
pnpm install && pnpm run build
```

Add your discogs secret token to .env in this project's root folder (it is not committed)

```
DISCOGS_TOKEN="###SUPER_DUPER_SECRET###"
```

Link the CLI commands globally:

```
pnpm link --global
```

This makes all `music-utils-*` commands available in your terminal.

# Features

## rip

### Usage

```
Music/Artist $> music-utils-rip -r <releaseId> -d <disc-number?>
```

`<releaseId>` refers to the Discogs item id, disc-number if there are more than 1 disc.
Creates a folder `Artist/YYYY Album Name` from your current position, rips the CD (via _cdparanoia_), converts WAV to FLAC, renames files, sets tags and fetches cover photo. All based on info from Discogs.

## cover-photo

### Usage

```
Music/Artist/2020 Album $> music-utils-cover-photo --releaseId <id>
```

```
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
/> music-utils-similarities -A /path/to/origin/ -B /path/to/comparator/ -T 0.5 -Q
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
