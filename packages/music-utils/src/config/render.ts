import type { Release, Track } from '../types';
import type { Config } from './schema';

/** Replace `{token}` occurrences with values from `vars`. Missing keys resolve to ''. */
export const renderTemplate = (template: string, vars: Record<string, string | undefined>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');

/**
 * A name as a folder can hold it (as music-audit's sanitizeFilename()): a path separator
 * or colon ("Opening/Siberian Khatru", "Title: Part 2") becomes " - ", the rest of
 * `*?"<>|` and control characters are dropped. Tags keep the name as it is.
 */
export const folderSafe = (name?: string): string | undefined =>
  name
    ?.replace(/\s*[/\\:]\s*/g, ' - ')
    .replace(/[*?"<>|\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim();

/**
 * An album or track title as a folder or file name holds it: folderSafe(), and no trailing
 * dots ("Dexter Calling . . ." → "Dexter Calling"), which SMB can't carry (a Synology share
 * stores them as private-use characters, so the name has two spellings). Artist names keep
 * theirs ("I.P.A."): there the dots are the name.
 */
export const titleSafe = (name?: string): string | undefined => folderSafe(name)?.replace(/[\s.-]+$/, '');

const isMultiDisc = (release: Partial<Release>): boolean => {
  const n = parseInt(release.noOfDiscs ?? '', 10);
  return Number.isFinite(n) && n > 1;
};

/** Render the album folder name (last path segment only, no artist prefix). */
export const renderAlbumFolder = (release: Partial<Release>, config: Config): string => {
  const { patterns } = config;
  const discSuffix = isMultiDisc(release)
    ? renderTemplate(patterns.discSuffix, {
        disc: release.discNumber,
        total: release.noOfDiscs,
        discSep: config.disc.separator,
      })
    : '';
  const auxSuffix = release.aux ? renderTemplate(patterns.auxSuffix, { aux: folderSafe(release.aux) }) : '';
  return renderTemplate(patterns.albumFolder, {
    year: release.year,
    album: titleSafe(release.album),
    discSuffix,
    auxSuffix,
  })
    .replace(/\s+/g, ' ')
    .trim();
};

/** Render the artist folder name. */
export const renderArtistFolder = (release: Partial<Release>, config: Config): string =>
  renderTemplate(config.patterns.artistFolder, { artist: folderSafe(release.artist) });

/**
 * Render a track filename (excluding the file extension).
 *
 * Uses `trackMultiDisc` when the track has an explicit `discNumber` or the
 * release spans multiple discs; otherwise `track`.
 */
export const renderTrackName = (track: Partial<Track>, release: Partial<Release>, config: Config): string => {
  const useMultiDisc = isMultiDisc(release) || track.discNumber !== undefined;
  const template = useMultiDisc ? config.patterns.trackMultiDisc : config.patterns.track;
  const artist = folderSafe(release.artist);
  const artistPrefix = artist ? renderTemplate(config.patterns.artistPrefix, { artist }) : ' ';
  return renderTemplate(template, {
    disc: track.discNumber ?? release.discNumber,
    trackNo: track.trackNo,
    title: titleSafe(track.trackName),
    artist,
    artistPrefix,
  });
};
