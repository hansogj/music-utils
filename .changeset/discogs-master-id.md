---
"@hansogj/discogs-item-lookup": minor
---

Accept Discogs master IDs (`m1439`, `[m1439]`) and release/master URLs; a master resolves to its main release. Previously `m1439` was silently treated as release 1439. `masterYear` now falls back to the release year when the master's year is unknown (0), and the result includes `releaseId` and `masterId`. `title` now comes from the master when there is one (the pressing's own title is in `releaseTitle`).
