# @hansogj/music-utils

## 1.3.33

### Patch Changes

- c8236c3: parallel cover-art fetch during `music-utils-rip`

  The Discogs cover fetch now starts as soon as we `chdir` into the album folder, in parallel with `cdparanoia`. Previously it was serialized after `cdparanoia` + WAV→FLAC + rename, which added seconds to the critical path for no reason (cover fetch is IO-bound on Discogs; the rip is IO-bound on the optical drive).

  Also fails soft: a Discogs error no longer aborts the rip. The error is logged and the rip continues — losing a 10-minute CD read to a transient Discogs blip is worse than shipping without a cover file.
