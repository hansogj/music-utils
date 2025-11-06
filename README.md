[![example workflow](https://github.com/hansogj/music-utils/actions/workflows/build.yml/badge.svg)](https://github.com/hansogj/music-utils/actions/workflows/build.yml/badge.svg)

# Dependencies

install following dependencies

```bash
sudo apt install \
id3v2 \
flac \
cdparanoia \
```

# Installation

```
npm ci && npm run build
```

Add your discogs secret token to .env in this project's root folder (it is not comitted)

```
DISCOGS_TOKEN="###SUPER_DUPER_SECRET###"

```

# Features

_Music Utils_ provides 5 scripts:

- ripoff.sh
- cdrip.sh
- cover.photo.sh
- tag.album.sh
- tag.tracks.sh

Bind them to your _.bashrc_ file by

```
    source /path/to/music-utils/scripts/index.sh
```

## rip-off

### Usage

```
Music/Artist $> music-utils-rip-of -r <releaseId> -d <disc-number?>
```

<releaseId> refers to the Discogs item id, disc-number if there are more than 1 disc
Creates a folder 'Artist/2020 Album Name' from your current position (pwd), rips the cd in your cd-drive (with help from _cdparanoia_), converts all wav-files to flac-files [wav2flac](./scripts/wav2flac.sh), setting tags "Album" and "Artist" according to values in current path, rename files and fetches cover photo. All based on the info stored on Discogs on this release.

## cdrip [deprecated]

### Usage

```
Music/Artist $> music-utils-cdrip Album\ Name
```

Creates a folder 'Album Name' from your current position (pwd), rips the cd in your cd-drive (with help from _cdparanoia_), converts all wav-files to flac-files [wav2flac](./scripts/wav2flac.sh) and setting tags "Album" and "Artist" according to values in current path

## cover.photo

### Usage

```
Music/Artist/2020 Album $> music-utils-cover-photo <releaseId>
```

```
Music/Artist/2020 Album $> music-utils-cover-photo
```

Parse your current position (pwd) to extract artist and album information. Then, fetching matching cover photos from Discogs and places the resulting image in a 'cover.jpg' file. Latter option deduce the item from current path and are less accurate.

## tag-album

### Usage

```
Music/Artist/YYYY Album $> music-utils-tag-album
Music/Artist $> music-utils-tag-album -a YYYY Album
Music/Artist $> music-utils-tag-album --album YYYY Album
```

Parse your current position (pwd) to extract artist and album information. Then, for each file in current directory, extracts information either from flac, mp3 or file path, structurize these, rewrites tags and renames folder to match with standardized structure as follows:

- Artist/YYYY Album name
- Artist/YYYY Album name [extended info]
- Artist/YYYY Album name (Disc 1∕2)

## tag-tracks

### Usage

```
Music/Artist/2020 Album $> tag-tracks.sh -f /path/to/tracks.txt
```

As _tag-album_ but fetches tracks info from provided tracks.txt file

## Find similarities among music folders

If your catalog consist of ie

```
| - A
    | - A Band
| - B
    | - Band, A
```

where _A Band_ is actually the same band as _Band, A_ , similarities script will output as a table

### Usage

```
/>  ./scripts/similarities.sh -A /path/to/origin/ -B /path/to/comparator/ -T 0.5  -Q > output.table
```

Where

- **-A** is base directory
- **-B** is comparing directory
- **-T** is threshold of equality
- **-Q** to quiet
