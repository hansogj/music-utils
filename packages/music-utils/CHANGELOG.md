# @hansogj/music-utils

## 1.5.0

### Minor Changes

- cc89c8f: feat: three new config knobs — `cover.filename`, `disc.separator`, `flac.compressionLevel`

  Tier 2 of the config work started in PR #72. Three new keys:
  - **`cover.filename`** (default `"cover.jpg"`) — filename `music-utils-rip` and `music-utils-cover-photo` write for album art. Set to `"folder.jpg"` for the Windows convention, `"AlbumArt.jpg"` for other players.
  - **`disc.separator`** (default `"∕"` U+2215) — character between disc-number and total in multi-disc folder names (`Disc 1∕2`). Cannot be `/` (filesystem restriction). Common alternates: `-`, `_`. Also used when sanitizing strings containing `/` in tags/tracklists.
  - **`flac.compressionLevel`** (default `5`, range `0`–`8`) — passed to the `flac` CLI as `-<level>` during the WAV→FLAC conversion step in `music-utils-rip`.

  `patterns.discSuffix` gained a `{discSep}` token so overriding `disc.separator` also flows through the default suffix without also having to override the pattern.

  Housekeeping: removed the unused `COVER_FILE_RESOLUTION = 600` constant. It was declared but never plumbed into `discogs-cover`'s API (which doesn't accept a resolution parameter).

### Patch Changes

- 2d4c5fe: fix: `music-utils-rip` no longer asks "Is this right info? Y/N?" twice

  The rip flow was prompting for confirmation once after the Discogs lookup and again inside `tagAlbum` (which does its own `parseAlbumInfo` + `albumPrompt`). Rippers had to say "yes" twice for every disc.

  Fix: `tagAlbum` now accepts an optional pre-confirmed `Release` as its third argument. When supplied, it skips the internal path parsing and prompt entirely. `music-utils-rip` passes the already-confirmed `safeRelease` through, so the second prompt is skipped. The other four callers of `tagAlbum` (`bulk.tag.album`, `tag.album`, `tag.cover.album`, `tag.tracks`) don't pass the arg, so their behavior is unchanged.

## 1.4.0

### Minor Changes

- 25477db: add `music-utils-completion` — shell tab-completion for every CLI

  New bin `music-utils-completion bash` prints a bash completion script that covers all nine `music-utils-*` commands. Flag-name completion for everything, plus file/directory completion for path-valued flags (`-f`/`--fileName` completes files; `-A`/`-B` complete directories; `-a`/`--album` completes directories; positional args on `music-utils-bulk-*` complete directories).

  Install (session):

  ```
  source <(music-utils-completion bash)
  ```

  Install (persistent):

  ```
  music-utils-completion bash > ~/.local/share/bash-completion/completions/music-utils
  ```

  Zsh and fish are on the backlog.

## 1.3.33

### Patch Changes

- c8236c3: parallel cover-art fetch during `music-utils-rip`

  The Discogs cover fetch now starts as soon as we `chdir` into the album folder, in parallel with `cdparanoia`. Previously it was serialized after `cdparanoia` + WAV→FLAC + rename, which added seconds to the critical path for no reason (cover fetch is IO-bound on Discogs; the rip is IO-bound on the optical drive).

  Also fails soft: a Discogs error no longer aborts the rip. The error is logged and the rip continues — losing a 10-minute CD read to a transient Discogs blip is worse than shipping without a cover file.
