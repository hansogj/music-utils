---
"@hansogj/music-utils": minor
---

feat: three new config knobs — `cover.filename`, `disc.separator`, `flac.compressionLevel`

Tier 2 of the config work started in PR #72. Three new keys:

- **`cover.filename`** (default `"cover.jpg"`) — filename `music-utils-rip` and `music-utils-cover-photo` write for album art. Set to `"folder.jpg"` for the Windows convention, `"AlbumArt.jpg"` for other players.
- **`disc.separator`** (default `"∕"` U+2215) — character between disc-number and total in multi-disc folder names (`Disc 1∕2`). Cannot be `/` (filesystem restriction). Common alternates: `-`, `_`. Also used when sanitizing strings containing `/` in tags/tracklists.
- **`flac.compressionLevel`** (default `5`, range `0`–`8`) — passed to the `flac` CLI as `-<level>` during the WAV→FLAC conversion step in `music-utils-rip`.

`patterns.discSuffix` gained a `{discSep}` token so overriding `disc.separator` also flows through the default suffix without also having to override the pattern.

Housekeeping: removed the unused `COVER_FILE_RESOLUTION = 600` constant. It was declared but never plumbed into `discogs-cover`'s API (which doesn't accept a resolution parameter).
