---
'@hansogj/music-utils': minor
---

`music-utils rip` tags and files an album the way `music-audit` does after Discogs tagging:

- When Discogs credits several artists, a list asks for the name (first credited artist, all credits, or typed). One name goes in the artist folder, `ARTIST`, `ALBUMARTIST` and `info.txt`.
- The confirm step (rip, `tag album`) shows the release as a table, with the folder it goes to and the Discogs IDs, instead of a JSON dump.
- FLAC tags also get `ORIGINALDATE`, `GENRE`, `COMMENT` (release URL), `DISCOGS_RELEASE_ID` and `DISCOGS_MASTER_ID`; `DISCTOTAL` replaces the old `DISCID=1/2` tag (removed when disc info is written).
- MP3 tags get `TPE2` (album artist) too.
- Tags keep titles as they are (`:` and `/` used to become `_`); folder names turn `/`, `\` and `:` into ` - `.
- An `info.txt` with the Discogs tracklist, durations, composers, personnel and `Discogs-Release:` / `Discogs-Master:` / `Disc:` lines is written in the album folder (an existing one is kept).
