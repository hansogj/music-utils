---
"@hansogj/music-utils": patch
---

fix: `music-utils-rip` no longer asks "Is this right info? Y/N?" twice

The rip flow was prompting for confirmation once after the Discogs lookup and again inside `tagAlbum` (which does its own `parseAlbumInfo` + `albumPrompt`). Rippers had to say "yes" twice for every disc.

Fix: `tagAlbum` now accepts an optional pre-confirmed `Release` as its third argument. When supplied, it skips the internal path parsing and prompt entirely. `music-utils-rip` passes the already-confirmed `safeRelease` through, so the second prompt is skipped. The other four callers of `tagAlbum` (`bulk.tag.album`, `tag.album`, `tag.cover.album`, `tag.tracks`) don't pass the arg, so their behavior is unchanged.
