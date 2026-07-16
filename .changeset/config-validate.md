---
"@hansogj/music-utils": patch
---

fix: validate config file types + ranges at load time

`loadConfig` now runs a schema check after merging. Bad values in your `music-utils.config.json` or `~/.music-utilsrc.json` throw a `ConfigError` naming the offending path (e.g. `"flac.compressionLevel: expected 0–8, got 9"`) instead of silently passing through to a `flac` invocation, `parseInt`, or a template renderer.

Checks:
- All string keys are strings (`tracksFile`, `patterns.*`, `cover.filename`, `disc.separator`).
- `libraryRoot` is a string or `undefined`.
- `artist.sortArticles` is a boolean; `artist.articles` is a string array.
- `flac.compressionLevel` is an integer in `0..8`.
- `disc.separator` is non-empty and doesn't contain `/`.

Behavior for valid configs (including the default) is unchanged. `ConfigError` and `validateConfig` are now exported from `@hansogj/music-utils/build/config` if you want to run the check yourself.
