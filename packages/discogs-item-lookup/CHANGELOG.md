# @hansogj/discogs-item-lookup

## 1.5.0

### Minor Changes

- c47e738: Accept Discogs master IDs (`m1439`, `[m1439]`) and release/master URLs; a master resolves to its main release. Previously `m1439` was silently treated as release 1439. `masterYear` now falls back to the release year when the master's year is unknown (0), and the result includes `releaseId` and `masterId`. `title` now comes from the master when there is one (the pressing's own title is in `releaseTitle`).

## 1.4.0

### Minor Changes

- 13736c7: Strip Discogs disambiguation numbers from artist names (e.g. "Area (6)" → "Area"), expose `totalDiscs` on `LookupResult` so multi-disc releases report the correct disc count even when a disc filter is applied, and add a startup version check to `music-utils-rip` that warns when a newer version is available on npm.

## 1.3.0

### Minor Changes

- efec5fb: chore: update dependencies to latest minor versions
