# @hansogj/discogs-item-lookup

## 1.7.0

### Minor Changes

- 33a3e24: Fix: a suite (index entry) whose parts carry track numbers of their own, such as Dice's "War" with a) to d) on tracks 1–4 (r11456763), was read as one track, so a 10-track CD came out as 4. Such parts are now tracks of their own, titled "War; a) Ouverture", with `suite` and `part` fields; `formatInfoTxt()` lists them under a suite heading. Parts with lettered positions ("1-5.a") still make one track.

  New: `lookupRelease({ trackCount })` reads suites the way that gives that many tracks (split or joined), `flattenTracklist(tracklist, 'split' | 'joined')`, `fitTracklist()` and `hasSuites()`. Disc numbers come only from disc prefixes ("1-03", "2.05"), so a lettered position ("2.a") no longer counts as disc 2.

## 1.6.0

### Minor Changes

- 71e7b99: `lookupRelease()` returns more of the release: `artists` (each credited artist, Discogs' `(n)` dropped), `artistCredit` (every credit joined as Discogs shows it, `/` as `, `; only when several), `genres`, `styles`, `country`, `extraartists` (personnel), a whole-release `tracklist`, and per track `duration` and `extraartists`. `artist` is deprecated.

  Fix: a suite listed as an index entry with sub-tracks (e.g. "And You And I") was dropped from the tracklist, so the titles after it landed on the wrong tracks. It is now one track, numbered from its first part.

  New export `@hansogj/discogs-item-lookup/format` (also from the package root): `cleanArtistName()`, `joinArtistCredit()`, `flattenTracklist()`, `formatInfoTxt()`, `infoTxtIdLines()`, shared by music-utils and music-audit.

## 1.5.1

### Patch Changes

- ab8d1b5: Update dotenv to 18 and commander to 15. discogs-cover no longer prints dotenv's "injected env" line on start.
- 8e3c7db: Update dependencies: @hansogj/maybe 2.7.3, @hansogj/array.utils 3.0.2.

## 1.5.0

### Minor Changes

- c47e738: Accept Discogs master IDs (`m1439`, `[m1439]`) and release/master URLs; a master resolves to its main release. Previously `m1439` was silently treated as release 1439. `masterYear` now falls back to the release year when the master's year is unknown (0), and the result includes `releaseId` and `masterId`. `title` now comes from the master when there is one (the pressing's own title is in `releaseTitle`).

## 1.4.0

### Minor Changes

- 13736c7: Strip Discogs disambiguation numbers from artist names (e.g. "Area (6)" → "Area"), expose `totalDiscs` on `LookupResult` so multi-disc releases report the correct disc count even when a disc filter is applied, and add a startup version check to `music-utils-rip` that warns when a newer version is available on npm.

## 1.3.0

### Minor Changes

- efec5fb: chore: update dependencies to latest minor versions
