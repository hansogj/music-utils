import { renderAlbumFolder, renderArtistFolder } from '../config/render';
import type { Config } from '../config/schema';
import type { Release } from '../types';

/**
 * The release as aligned "Label  value" lines for the confirm prompt (rip, tag album),
 * instead of a JSON dump. Empty fields are left out; Disc only for a multi-disc release.
 */
export const releaseTable = (release: Partial<Release>, config: Config): string[] => {
  const total = parseInt(release.noOfDiscs ?? '', 10);
  const { discogs } = release;
  const rows: Array<[string, string | undefined]> = [
    ['Artist', release.artist],
    ['Album', release.album],
    ['Year', release.year],
    ['Disc', total > 1 ? `${release.discNumber ?? 1} of ${total}` : undefined],
    ['Extra', release.aux],
    ['Genre', discogs?.genre],
    [
      'Folder',
      release.artist || release.album
        ? `${renderArtistFolder(release, config)}/${renderAlbumFolder(release, config)}`
        : undefined,
    ],
    ['Discogs', discogs && `r${discogs.releaseId}${discogs.masterId ? ` · m${discogs.masterId}` : ''}`],
  ];
  const shown = rows.filter((row): row is [string, string] => !!row[1]?.trim());
  const width = Math.max(...shown.map(([label]) => label.length));
  return shown.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`);
};
