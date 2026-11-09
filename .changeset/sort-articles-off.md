---
"@hansogj/music-utils": minor
---

`artist.sortArticles` is now off by default: artist folders keep their article (`The Beatles`), matching a `Letter/Artist` library where the letter, not the name, drops the article. Set `"sortArticles": true` in `music-utils.config.json` to get `Beatles, The` back.

When enabled, articles match in any case and keep the artist's own casing (`The Beatles` → `Beatles, The`, previously `Beatles, the`).
