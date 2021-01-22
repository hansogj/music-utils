Dependencies

id3v2
metaflac
cdparanoia

TODO
* [v] fortsett splitting av tag til mp3, flac og from File 
* [v] fullfør omskriving av testfiler for hver av ovennevnte
* [v] test mp3 for id3v1 og id3v2 - separat output (gjenstår id3v1)
* [v] test track med noDisc + noTrack
* [v] add year as prefix to 
* [v] get track name from list of tracks
* [v] cdrip
* [v] get track name from list of tracks
* [ ] include coverPhoto-function as part of music-utils


# Installation

```
npn ci && npm run build

```

# Features

_Music Utils_ provides 4  scripts: 
* cdrip.sh  
* cover.photo.sh
* tag.album.sh  
* tag.tracks.sh

It's recomended to assign aliases for them i.e: 

```
alias music-utils-cdrip="PATH/TO/music-utils/scripts/cdrip.sh"
alias music-utils-cover-photo="PATH/TO/music-utils/scripts/cover.photo.sh"
alias music-utils-tag-album="PATH/TO/music-utils/scripts/tag.album.sh"
alias music-utils-tag-tracks="PATH/TO/music-utils/scripts/tag.tracks.sh"

```



## cdrip

### Usage
 ```
Music/Artist> music-utils-cdrip Album\ Name
 ```

Creates a folder 'Album Name' from your current position (pwd), rips the cd in your cd-drive (with help from _cdparanoia_), converts all wav-files to flac-files [wav2flac](./scripts/wav2flac.sh) and setting tags "Album" and "Artist" according to values in current path
 

## cover.photo

### Usage
 ```
Music/Artist/2020 Album> music-utils-cover-photo
 ```

Parse your current position (pwd) to extract artist and album information. Then, with help from _sacad_, searches the Internet for matching cover photos and places the resulting image in a 'cover.jpg' file


## tag-album

### Usage
 ```
Music/Artist/2020 Album> Music/Artist/2020 Album> music-utils-tag-album
 ```

Parse your current position (pwd) to extract artist and album information. Then, for each file in current directory, extracts information either from flac, mp3 or file path, structurize these, rewrites tags and renames folder to match with standardized structure as follows: 

* Artist/YYYY Album name
* Artist/YYYY Album name [extended info]
* Artist/YYYY Album name (Disc 1∕2)


## tag-tracs

### Usage
 ```
Music/Artist/2020 Album>  tag-tracks.sh -f /path/to/tracks.txt 
 ```

As _tag-artist_ but fetches tracks info from provided tracks.txt file
   
