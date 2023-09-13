![example workflow](https://github.com/github/docs/actions/workflows/webpack.yml/badge.svg)

# Dependencies

id3v2
metaflac
cdparanoia

TODO

- [v] fortsett splitting av tag til mp3, flac og from File
- [v] fullfør omskriving av testfiler for hver av ovennevnte
- [v] test mp3 for id3v1 og id3v2 - separat output (gjenstår id3v1)
- [v] test track med noDisc + noTrack
- [v] add year as prefix to
- [v] get track name from list of tracks
- [v] cdrip
- [v] get track name from list of tracks
- [v] include coverPhoto-function as part of music-utils
- [v] extract additional info from `YYYY Album [some additional info] (Disc 1)`
- [v] detect similarities across folders

# Installation

```
npn ci && npm run build

```

# Features

_Music Utils_ provides 5 scripts:

- cdrip.sh
- cover.photo.sh
- tag.album.sh
- tag.tracks.sh
- glyrc.cover.photo.sh

Bind them to your _.bashrc_ file by

```
    source /path/to/music-utils/scripts/index.sh
```

Index.sh also creates an alias for bulk fetching cover photos with glyrc.

## cdrip

### Usage

```
Music/Artist $> music-utils-cdrip Album\ Name
```

Creates a folder 'Album Name' from your current position (pwd), rips the cd in your cd-drive (with help from _cdparanoia_), converts all wav-files to flac-files [wav2flac](./scripts/wav2flac.sh) and setting tags "Album" and "Artist" according to values in current path

## cover.photo

### Usage

```
Music/Artist/2020 Album $> music-utils-cover-photo
```

Parse your current position (pwd) to extract artist and album information. Then, with help from _sacad_, searches the Internet for matching cover photos and places the resulting image in a 'cover.jpg' file

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

Where -A is dir1, -B is dir2, T is threshold of equality and Q is quiet
