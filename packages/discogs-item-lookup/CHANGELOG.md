# @hansogj/discogs-item-lookup

## 1.4.0

### Minor Changes

- 13736c7: Strip Discogs disambiguation numbers from artist names (e.g. "Area (6)" → "Area"), expose `totalDiscs` on `LookupResult` so multi-disc releases report the correct disc count even when a disc filter is applied, and add a startup version check to `music-utils-rip` that warns when a newer version is available on npm.

## 1.3.0

### Minor Changes

- efec5fb: chore: update dependencies to latest minor versions
