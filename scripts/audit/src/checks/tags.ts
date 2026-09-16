import type { Issue, TrackInfo } from '../types.js';

const REQUIRED: Array<keyof import('../types.js').TrackTags> = ['title', 'artist', 'album', 'year', 'trackNo'];

const LABEL: Record<string, string> = {
  title: 'TITLE',
  artist: 'ARTIST',
  album: 'ALBUM',
  year: 'DATE/YEAR',
  trackNo: 'TRACKNUMBER',
};

export function checkTags(track: TrackInfo): Issue[] {
  const issues: Issue[] = [];

  if (track.tagReadError) {
    issues.push({
      severity: 'HIGH',
      code: 'TAG_READ_ERROR',
      file: track.fileName,
      message: `Could not read tags: ${track.tagReadError}`,
      suggestion: `Ensure metaflac (for FLAC) and id3v2 (for MP3) are installed`,
    });
    return issues;
  }

  const missing = REQUIRED.filter((key) => !track.tags[key]);

  if (missing.length === REQUIRED.length) {
    issues.push({
      severity: 'HIGH',
      code: 'NO_TAGS',
      file: track.fileName,
      message: `Track has no tags`,
      suggestion: `Look up the release on Discogs and run music-utils-album-tag to tag the album`,
    });
  } else if (missing.length > 0) {
    const labels = missing.map((k) => LABEL[k]).join(', ');
    issues.push({
      severity: 'HIGH',
      code: 'MISSING_TAGS',
      file: track.fileName,
      message: `Missing tags: ${labels}`,
      suggestion: `Re-tag with music-utils-album-tag or music-utils-tracks-tag`,
    });
  }

  return issues;
}
