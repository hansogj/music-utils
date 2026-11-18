---
'@hansogj/discogs-item-lookup': minor
---

`lookupRelease()` returns more of the release: `artists` (each credited artist, Discogs' `(n)` dropped), `artistCredit` (every credit joined as Discogs shows it, `/` as `, `; only when several), `genres`, `styles`, `country`, `extraartists` (personnel), a whole-release `tracklist`, and per track `duration` and `extraartists`. `artist` is deprecated.

Fix: a suite listed as an index entry with sub-tracks (e.g. "And You And I") was dropped from the tracklist, so the titles after it landed on the wrong tracks. It is now one track, numbered from its first part.

New export `@hansogj/discogs-item-lookup/format` (also from the package root): `cleanArtistName()`, `joinArtistCredit()`, `flattenTracklist()`, `formatInfoTxt()`, `infoTxtIdLines()`, shared by music-utils and music-audit.
