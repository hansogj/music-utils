---
'@hansogj/music-utils': patch
---

`music-utils rip` tags a Discogs suite whose parts are tracks of their own as "Suite; part", and when the disc holds another number of tracks than Discogs lists, reads the suites the way that fits before tagging. `tracks.txt` is read back from where it was written (it was read from `../../tracks.txt`, wrong with `libraryRoot`), and a multi-disc tracklist keeps a line break between discs.
