# @hansogj/music-utils

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
