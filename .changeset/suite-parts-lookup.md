---
'@hansogj/discogs-item-lookup': minor
---

Fix: a suite (index entry) whose parts carry track numbers of their own, such as Dice's "War" with a) to d) on tracks 1–4 (r11456763), was read as one track, so a 10-track CD came out as 4. Such parts are now tracks of their own, titled "War; a) Ouverture", with `suite` and `part` fields; `formatInfoTxt()` lists them under a suite heading. Parts with lettered positions ("1-5.a") still make one track.

New: `lookupRelease({ trackCount })` reads suites the way that gives that many tracks (split or joined), `flattenTracklist(tracklist, 'split' | 'joined')`, `fitTracklist()` and `hasSuites()`. Disc numbers come only from disc prefixes ("1-03", "2.05"), so a lettered position ("2.a") no longer counts as disc 2.
