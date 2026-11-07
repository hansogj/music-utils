import type { AlbumLayout, Issue, OriginalYear, TrackInfo } from '../types.js';

const FOLDER_YEAR = /^(\d{4})\s+/;

const yearOf = (value?: string): string | undefined => value?.match(/\d{4}/)?.[0];

export function folderYear(albumFolder: string): string | undefined {
  return albumFolder.match(FOLDER_YEAR)?.[1];
}

// "1989 In Rock" → "1970 In Rock"; a folder without a year prefix gets one.
export function withFolderYear(albumFolder: string, year: string): string {
  return FOLDER_YEAR.test(albumFolder) ? albumFolder.replace(FOLDER_YEAR, `${year} `) : `${year} ${albumFolder}`;
}

// Returns the Discogs release ID to look up, or undefined when no lookup is needed:
// untagged albums, and albums already tagged with a consistent ORIGINALDATE (which
// only this tool writes, from the master year) are skipped to save API calls.
export function originalYearLookupId(layout: AlbumLayout, tracks: TrackInfo[]): string | undefined {
  const releaseId = tracks.map((t) => t.tags.discogsReleaseId?.trim()).find(Boolean);
  if (!releaseId) return undefined;
  const original = tracks.map((t) => yearOf(t.tags.originalYear)).find(Boolean);
  const consistent =
    original !== undefined &&
    folderYear(layout.albumFolder) === original &&
    tracks.every((t) => yearOf(t.tags.year) === original && yearOf(t.tags.originalYear) === original);
  return consistent ? undefined : releaseId;
}

export function checkOriginalYear(layout: AlbumLayout, tracks: TrackInfo[], original?: OriginalYear): Issue[] {
  if (!original?.year) return [];
  const inFolder = folderYear(layout.albumFolder);
  const inTags = [...new Set(tracks.map((t) => yearOf(t.tags.year)).filter((y): y is string => !!y))];
  // A missing folder year is MISSING_YEAR_PREFIX's job; only flag years that are wrong.
  const wrong = [...new Set([inFolder, ...inTags].filter((y): y is string => !!y && y !== original.year))];
  if (wrong.length === 0) return [];

  const source = original.masterId ? `master m${original.masterId}` : `release r${original.releaseId}`;
  const renamed =
    inFolder && inFolder !== original.year ? withFolderYear(layout.albumFolder, original.year) : undefined;
  return [
    {
      severity: 'HIGH',
      code: 'YEAR_NOT_ORIGINAL',
      message: `Year ${wrong.join('/')} is not the original release year ${original.year} (${source})`,
      suggestion: `Set DATE/ORIGINALDATE to ${original.year}${renamed ? ` and rename folder to "${renamed}"` : ''}`,
    },
  ];
}
